package app.vce.platform

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import app.tauri.plugin.Invoke
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

/** Foreground, half-duplex voice. No raw audio crosses the WebView or enters the model prompt. */
class VoiceController(private val activity: Activity, private val event: (JSONObject)->Unit) {
 private val main=Handler(Looper.getMainLooper())
 private var tts:TextToSpeech?=null
 private var ready=false
 private var failed=false
 private var recognizer:SpeechRecognizer?=null
 private var listening:Invoke?=null
 private var speaking:Invoke?=null
 private var chunks:List<SpeechChunk> = emptyList()
 private var chunkIndex=0
 private var utterance=""
 private var pending:Pair<Invoke,JSONObject>?=null
 private val audio=activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
 private var focus:AudioFocusRequest?=null
 private var speechStarted=0L
 private fun state(value:String){event(JSONObject().put("type","voice").put("state",value))}
 fun initialize(){main.post {
  if(tts!=null)return@post
  tts=TextToSpeech(activity){code->main.post {
   ready=code==TextToSpeech.SUCCESS;failed=!ready
   if(ready)tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener(){
    override fun onStart(id:String?){main.post {if(id==utterance){if(speechStarted==0L)speechStarted=android.os.SystemClock.elapsedRealtime();state("speaking")}}}
    override fun onDone(id:String?){main.post {if(id==utterance&&speaking!=null){if(chunkIndex+1<chunks.size){val delay=chunks[chunkIndex].pauseAfterMs;main.postDelayed({if(id==utterance&&speaking!=null){chunkIndex++;speakChunk()}},delay)}else{val call=speaking;speaking=null;utterance="";chunks=emptyList();releaseFocus();state("idle");call?.resolveObject(mapOf("completed" to true,"finishedAtMs" to android.os.SystemClock.elapsedRealtime(),"audioStartedAtMs" to speechStarted))}}}}
    @Deprecated("Android legacy callback") override fun onError(id:String?){main.post {if(id==utterance)failSpeech("Speech output failed. Check the installed voice and media volume.")}}
   })
   val wait=pending;pending=null
   if(wait!=null){if(ready)speak(wait.first,wait.second) else wait.first.reject("Android text-to-speech is unavailable. Install or enable a speech engine in Android settings.")}
  }}
 }}
 fun status():Map<String,Any> = mapOf("ttsReady" to ready,"ttsFailed" to failed,"onDeviceRecognition" to (Build.VERSION.SDK_INT>=31&&SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)),"deviceRecognition" to SpeechRecognizer.isRecognitionAvailable(activity),"voices" to (tts?.voices?.filter{!it.isNetworkConnectionRequired}?.map{mapOf("id" to it.name,"language" to it.locale.toLanguageTag(),"quality" to it.quality)}?:emptyList()),"microphoneGranted" to (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED))
 private fun acquireFocus():Boolean {
  val listener=AudioManager.OnAudioFocusChangeListener{change->if(change==AudioManager.AUDIOFOCUS_LOSS||change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)main.post{stop("Audio focus changed")}}
  return if(Build.VERSION.SDK_INT>=26){
   val request=AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setOnAudioFocusChangeListener(listener).build();focus=request;audio.requestAudioFocus(request)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }else{@Suppress("DEPRECATION") audio.requestAudioFocus(listener,AudioManager.STREAM_MUSIC,AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED}
 }
 private fun releaseFocus(){if(Build.VERSION.SDK_INT>=26)focus?.let{audio.abandonAudioFocusRequest(it)};focus=null}
 private fun failSpeech(message:String){val call=speaking;speaking=null;utterance="";tts?.stop();releaseFocus();state("idle");call?.reject(message)}
 fun speak(call:Invoke,args:JSONObject){main.post {
  val text=args.optString("text").trim();if(text.isEmpty()||text.length>16000){call.reject("Speech text must contain 1–16000 characters");return@post}
  if(!ready){if(failed){call.reject("Android speech output is not available");return@post};pending?.first?.reject("cancelled");pending=call to args;initialize();return@post}
  stop("cancelled")
  val locale=Locale.forLanguageTag(args.optString("language","en"));val language=tts!!.setLanguage(locale)
  if(language==TextToSpeech.LANG_MISSING_DATA||language==TextToSpeech.LANG_NOT_SUPPORTED){call.reject("Install the selected text-to-speech language in Android voice settings");return@post}
  // Never select a network-only voice without a separate, explicit choice.
  val available=tts!!.voices?.filter{!it.isNetworkConnectionRequired&&it.locale.language==locale.language}.orEmpty();val offline=available.firstOrNull{it.name==args.optString("voiceName")}?:available.sortedWith(compareByDescending<android.speech.tts.Voice>{it.locale.country==locale.country}.thenByDescending{it.quality}).firstOrNull()
  if(offline==null){call.reject("No installed offline voice for this language. Open Android voice settings to install one.");return@post}
  tts!!.voice=offline
  tts!!.setSpeechRate(args.optDouble("rate",0.94).toFloat().coerceIn(0.75f,1.2f));tts!!.setPitch(1.0f)
  if(!acquireFocus()){call.reject("Audio is in use by another app. Try again after the call or playback finishes.");return@post}
  chunks=SpeechPlan.build(text,locale,args.optLong("pauseMs",350).coerceIn(150,900));if(chunks.isEmpty()){call.resolve();return@post};chunkIndex=0;speaking=call;speechStarted=0;state("preparing");speakChunk()
 }}
 private fun speakChunk(){utterance=UUID.randomUUID().toString();if(tts!!.speak(chunks[chunkIndex].text,TextToSpeech.QUEUE_FLUSH,Bundle(),utterance)==TextToSpeech.ERROR)failSpeech("Android speech output could not start")}
 fun listen(call:Invoke,args:JSONObject){main.post {
  stop("cancelled")
  val offline=Build.VERSION.SDK_INT>=31&&SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)
  val allowNetwork=args.optBoolean("allowNetwork",false)
  if(!offline&&!allowNetwork){state("idle");call.reject("This phone has no available on-device recognizer. Install offline recognition or explicitly allow the device speech service in Voice settings.");return@post}
  if(!offline&&!SpeechRecognizer.isRecognitionAvailable(activity)){state("idle");call.reject("No Android speech recognition service is installed");return@post}
  if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){state("idle");call.reject("Microphone permission is required");return@post}
  listening=call;state("preparing")
  try {
   recognizer=if(offline&&Build.VERSION.SDK_INT>=31)SpeechRecognizer.createOnDeviceSpeechRecognizer(activity) else SpeechRecognizer.createSpeechRecognizer(activity)
   recognizer!!.setRecognitionListener(object:RecognitionListener{
    override fun onReadyForSpeech(params:Bundle?){if(listening !== call)return;state("listening")}
    override fun onBeginningOfSpeech(){}
    override fun onRmsChanged(rmsdB:Float){}
    override fun onBufferReceived(buffer:ByteArray?){}
    override fun onEndOfSpeech(){if(listening !== call)return;state("thinking")}
    override fun onPartialResults(results:Bundle?){}
    override fun onEvent(type:Int,params:Bundle?){}
    override fun onError(error:Int){if(listening !== call)return;val active=listening;listening=null;destroyRecognizer();releaseFocus();state("idle");active?.reject(when(error){SpeechRecognizer.ERROR_NO_MATCH->"No speech was recognized. Tap Talk and try again.";SpeechRecognizer.ERROR_SPEECH_TIMEOUT->"No speech was heard.";SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS->"Microphone permission was denied.";else->"Speech recognition error $error. Check the installed recognition language/service."})}
    override fun onResults(results:Bundle?){if(listening !== call)return;val active=listening;listening=null;val text=results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty();destroyRecognizer();state("idle");if(text.isBlank())active?.reject("No speech was recognized") else active?.resolveObject(mapOf("text" to text,"onDevice" to offline))}
   })
   val intent=Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_LANGUAGE,args.optString("language","en")).putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,false).putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true)
   recognizer!!.startListening(intent)
  }catch(error:Exception){listening=null;destroyRecognizer();state("idle");state("idle");call.reject(error.message?:"Could not start recognition")}
 }}
 private fun destroyRecognizer(){recognizer?.cancel();recognizer?.destroy();recognizer=null}
 fun stop(reason:String="cancelled"){val oldListen=listening;listening=null;destroyRecognizer();oldListen?.reject(reason);val oldSpeak=speaking;speaking=null;utterance="";tts?.stop();oldSpeak?.reject(reason);pending?.first?.reject(reason);pending=null;chunks=emptyList();releaseFocus();state("idle")}
 fun close(){main.post{stop();tts?.shutdown();tts=null;ready=false}}
}
