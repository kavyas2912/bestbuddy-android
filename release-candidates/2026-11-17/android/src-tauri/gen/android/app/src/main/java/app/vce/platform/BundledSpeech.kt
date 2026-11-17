package app.vce.platform

import android.app.Activity
import android.media.*
import android.os.SystemClock
import app.tauri.plugin.Invoke
import com.k2fsa.sherpa.onnx.*
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.sqrt

/** Default English speech runs locally, without installed Android speech services. */
class BundledSpeech(private val activity:Activity,private val event:(String)->Unit){
 private val worker=Executors.newSingleThreadExecutor{r->Thread(r,"Buddy-offline-speech")}
 private val epoch=AtomicLong();private val active=AtomicReference<Invoke?>()
 @Volatile private var output:AudioTrack?=null
 @Volatile private var capture:AudioRecord?=null
 private var synthesizer:OfflineTts?=null
 private var recognizer:OfflineRecognizer?=null
 fun idle()=active.get()==null
 fun ready()=BundledAssets.ready(activity)
 fun stop(reason:String="cancelled"){
  epoch.incrementAndGet();runCatching{capture?.stop()};runCatching{output?.pause();output?.flush()}
  active.getAndSet(null)?.reject(reason)
 }
 private fun finish(call:Invoke,error:Exception?=null){if(active.compareAndSet(call,null)){event("idle");if(error==null)call.resolveObject(mapOf("completed" to true,"engine" to "bundled-offline"))else call.reject(error.message?:"Offline speech failed")}}
 private fun task(call:Invoke,done:()->Unit,action:(Long)->Unit){
  stop();val ticket=epoch.get();active.set(call)
  worker.execute{try{if(ticket!=epoch.get())return@execute;BundledAssets.ensure(activity){event("preparing")};if(ticket!=epoch.get())return@execute;action(ticket);finish(call)}catch(e:Exception){finish(call,e)}finally{done()}}
 }
 fun speak(call:Invoke,args:JSONObject,done:()->Unit){task(call,done){ticket->
  val text=args.optString("text").trim();require(text.isNotBlank()&&text.length<=16000){"Speech text must contain 1–16000 characters"}
  event("preparing")
  val directory=File(BundledAssets.root(activity),"voice/tts")
  if(synthesizer==null)synthesizer=OfflineTts(config=OfflineTtsConfig(model=OfflineTtsModelConfig(
   vits=OfflineTtsVitsModelConfig(model=File(directory,"en_US-ljspeech-high.onnx").path,tokens=File(directory,"tokens.txt").path,dataDir=File(directory,"espeak-ng-data").path),numThreads=2)))
  // The speaker index is pinned with the resource manifest after checking ONNX metadata.
  val settings=JSONObject(File(BundledAssets.root(activity),"verified-v1.json").readText())
  val speaker=settings.getInt("speakerId")
  for(chunk in SpeechPlan.build(text,java.util.Locale.US,args.optLong("pauseMs",350).coerceIn(150,900))){
   if(ticket!=epoch.get())break
   val generated=synthesizer!!.generate(chunk.text,speaker,args.optDouble("rate",0.96).toFloat().coerceIn(0.75f,1.2f))
   if(ticket!=epoch.get())break
   val pcm=ShortArray(generated.samples.size){i->(generated.samples[i].coerceIn(-1f,1f)*32767).toInt().toShort()}
   val buffer=AudioTrack.getMinBufferSize(generated.sampleRate,AudioFormat.CHANNEL_OUT_MONO,AudioFormat.ENCODING_PCM_16BIT).coerceAtLeast(8192)
   val track=AudioTrack.Builder().setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setAudioFormat(AudioFormat.Builder().setSampleRate(generated.sampleRate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build()).setBufferSizeInBytes(buffer).setTransferMode(AudioTrack.MODE_STREAM).build()
   output=track
   try{
    require(track.state==AudioTrack.STATE_INITIALIZED){"Speaker output unavailable"};event("speaking");track.play();var offset=0
    while(offset<pcm.size&&ticket==epoch.get()){val n=track.write(pcm,offset,minOf(2048,pcm.size-offset),AudioTrack.WRITE_BLOCKING);require(n>0){"Speaker write failed"};offset+=n}
    val deadline=SystemClock.elapsedRealtime()+pcm.size*1000L/generated.sampleRate+2000
    while(ticket==epoch.get()&&track.playbackHeadPosition.toLong()<offset&&SystemClock.elapsedRealtime()<deadline)Thread.sleep(15)
   }finally{output=null;runCatching{track.stop()};track.release()}
   if(ticket==epoch.get())Thread.sleep(chunk.pauseAfterMs)
  }
 }}
 fun listen(call:Invoke,done:()->Unit){task(call,done){ticket->
  val rate=16000;val buffer=AudioRecord.getMinBufferSize(rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT).coerceAtLeast(8192)
  val recorder=AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,rate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,buffer)
  require(recorder.state==AudioRecord.STATE_INITIALIZED){"Microphone is unavailable"}
  capture=recorder;val samples=ArrayList<Float>();val block=ShortArray(800);var voiced=0;var quiet=0;var frames=0;var floor=0.003
  try{
   recorder.startRecording();event("listening")
   while(ticket==epoch.get()&&frames<rate*18){
    val count=recorder.read(block,0,block.size);require(count>0){"Microphone capture failed"}
    val rms=sqrt((0 until count).sumOf{val x=block[it]/32768.0;x*x}/count)
    if(frames<rate/4)floor=maxOf(floor,rms)
    val speech=rms>maxOf(0.008,minOf(0.04,floor*2.8))
    if(speech){voiced+=count;quiet=0}else if(voiced>0)quiet+=count
    for(i in 0 until count)samples.add(block[i]/32768f)
    frames+=count
    if(voiced>=rate/4&&quiet>=rate)break
    if(voiced==0&&frames>=rate*7)break
   }
  }finally{capture=null;runCatching{recorder.stop()};recorder.release()}
  if(ticket!=epoch.get())return@task
  require(voiced>=rate/4){"No speech was heard"};event("thinking")
  val directory=File(BundledAssets.root(activity),"voice/asr")
  if(recognizer==null)recognizer=OfflineRecognizer(config=OfflineRecognizerConfig(modelConfig=OfflineModelConfig(whisper=OfflineWhisperModelConfig(encoder=File(directory,"base.en-encoder.int8.onnx").path,decoder=File(directory,"base.en-decoder.int8.onnx").path),tokens=File(directory,"base.en-tokens.txt").path,modelType="whisper",numThreads=2)))
  val stream=recognizer!!.createStream()
  try{
   stream.acceptWaveform(samples.toFloatArray(),rate);recognizer!!.decode(stream)
   val text=recognizer!!.getResult(stream).text.trim();require(text.isNotBlank()){ "No speech was recognized" }
   if(ticket==epoch.get()&&active.compareAndSet(call,null)){event("idle");call.resolveObject(mapOf("text" to text,"onDevice" to true,"engine" to "Whisper base.en"))}
  }finally{stream.release()}
 }}
 fun close(){stop();worker.execute{synthesizer?.release();recognizer?.release();synthesizer=null;recognizer=null};worker.shutdown()}
}
