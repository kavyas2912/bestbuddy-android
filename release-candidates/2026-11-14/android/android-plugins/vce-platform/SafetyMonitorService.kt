package app.vce.platform

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.*
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONObject
import kotlin.math.log10
import kotlin.math.sqrt

/** Explicitly started, visible, non-sticky safety session. PCM exists only in a reusable RAM buffer. */
class SafetyMonitorService:Service(){
 companion object{
  const val START="buddy.safety.START";const val STOP="buddy.safety.STOP";const val ACK="buddy.safety.ACK";const val CHECK="buddy.safety.CHECK"
  private const val MONITOR=7310;private const val ALERT=7311
  @Volatile var active=false;private set
  @Volatile var snapshot=JSONObject().put("active",false).put("state","off")
  @Volatile var buddyVoice=false
  @Volatile var resumeAudioAt=0L
  @Volatile var ackRecognizerActive=false
  @Volatile private var instance:SafetyMonitorService?=null
  @Volatile var captureActive=false
  fun voiceState(value:String){buddyVoice=value in setOf("preparing","listening","speaking");if(buddyVoice)instance?.main?.post{instance?.stopAckRecognition()};if(!buddyVoice)resumeAudioAt=SystemClock.elapsedRealtime()+2000}
 }
 private val main=Handler(Looper.getMainLooper())
 @Volatile private var running=false
 @Volatile private var recorder:AudioRecord?=null
 @Volatile private var ownSpeech=false
 private var worker:Thread?=null
 private var unlockReceiver:android.content.BroadcastReceiver?=null
 private var rules:SafetyRules?=null
 private var alarmHelp=false
 private var alarmUntil=0L
 private var alarmDurationMs=30000L
 private var lastBeep=0L
 private var tone:android.media.ToneGenerator?=null
 private var autoCalls=false
 private var dryRun=false
 private var healthcareName="Healthcare contact"
 private var healthcareNumber=""
 private var callStatus="No call requested"
 private var recognizer:android.speech.SpeechRecognizer?=null
 private var contactName="Trusted contact"
 private var contactNumber=""
 private var tts:TextToSpeech?=null
 private var ttsReady=false
 private var spoken=true
 private var acoustic=false
 private var scheduled=false
 private val audio by lazy{getSystemService(android.media.AudioManager::class.java)}
 private var lastError=""
 override fun onBind(intent:Intent?)=null
 override fun onCreate(){super.onCreate();instance=this;val manager=getSystemService(NotificationManager::class.java);manager.createNotificationChannel(NotificationChannel("buddy_safety_monitor","Buddy safety monitoring",NotificationManager.IMPORTANCE_LOW));manager.createNotificationChannel(NotificationChannel("buddy_safety_alert","Buddy safety check-ins",NotificationManager.IMPORTANCE_HIGH).apply{description="Check-ins and unanswered-check-in alerts";enableVibration(true)})}
 private fun serviceAction(action:String,code:Int)=PendingIntent.getService(this,code,Intent(this,SafetyMonitorService::class.java).setAction(action),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 private fun openApp(call:Boolean=false):PendingIntent{val intent=packageManager.getLaunchIntentForPackage(packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("buddy_safety_open",true);if(call)intent.putExtra("buddy_safety_call",true).putExtra("buddy_safety_name",if(rules?.state in setOf("healthcare-warning","escalated")&&autoCalls)healthcareName else contactName).putExtra("buddy_safety_number",if(rules?.state in setOf("healthcare-warning","escalated")&&autoCalls)healthcareNumber else contactNumber);return PendingIntent.getActivity(this,if(call)7341 else 7340,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)}
 private fun monitorNotification():Notification=Notification.Builder(this,"buddy_safety_monitor").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Buddy safety mode is on").setContentText(if(acoustic)"Local sound checks · no audio saved · tap to view"else"Scheduled check-ins · tap to view").setOngoing(true).setContentIntent(openApp()).addAction(Notification.Action.Builder(null,"Stop",serviceAction(STOP,1)).build()).build()
 private fun alert(escalated:Boolean){
  val phase=rules?.state.orEmpty();val title=if(escalated)"Buddy safety escalation"else"Buddy: are you OK?"
  val text=(if(dryRun)"TEST · no calls will be made. "else "")+when(phase){"final-warning"->"Final check-in: family contact call in 30 seconds unless you respond.";"family-wait"->callStatus+". Healthcare escalation follows if still unacknowledged.";"healthcare-warning"->"Final warning: healthcare contact call in 30 seconds unless you respond.";"escalated"->if(autoCalls)callStatus else "No response received. This alert is on this phone; nobody has been contacted.";else->"Are you OK? Say Buddy, I am okay, or tap I’m OK. "+(if(autoCalls)"Repeated unanswered checks lead to configured calls."else"Nobody is contacted automatically.")}
  val builder=Notification.Builder(this,"buddy_safety_alert").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle(title).setContentText(text).setStyle(Notification.BigTextStyle().bigText(text)).setCategory(Notification.CATEGORY_REMINDER).setOngoing(true).setAutoCancel(false).setContentIntent(openApp()).setVisibility(Notification.VISIBILITY_PRIVATE).addAction(Notification.Action.Builder(null,"I’m OK / cancel",serviceAction(ACK,2)).build())
  if(contactNumber.isNotBlank())builder.addAction(Notification.Action.Builder(null,"Call contact",openApp(true)).build())
  getSystemService(NotificationManager::class.java).notify(ALERT,builder.build())
  stopAckRecognition()
  if(alarmHelp&&phase in setOf("final-warning","family-wait","healthcare-warning","escalated")){alarmUntil=SystemClock.elapsedRealtime()+alarmDurationMs;if(audio.mode==android.media.AudioManager.MODE_NORMAL)runCatching{if(tone==null)tone=android.media.ToneGenerator(android.media.AudioManager.STREAM_ALARM,100);tone?.startTone(android.media.ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD,600);lastBeep=SystemClock.elapsedRealtime()}}
  if(spoken&&ttsReady&&!buddyVoice&&audio.mode==android.media.AudioManager.MODE_NORMAL){ownSpeech=true;val params=Bundle().apply{putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME,1f)};val voiceText=if(alarmHelp&&phase in setOf("final-warning","healthcare-warning","escalated"))text+" Please help. Someone nearby, please check on me."else text;val result=tts?.speak(voiceText,TextToSpeech.QUEUE_FLUSH,params,"buddy-safety-check");if(result==TextToSpeech.ERROR){ownSpeech=false;startAckRecognition()}}else startAckRecognition()
 }
 private fun stopAckRecognition(){ackRecognizerActive=false;val old=recognizer;recognizer=null;runCatching{old?.cancel()};runCatching{old?.destroy()}}
 private fun acknowledge(){alarmUntil=0;runCatching{tone?.stopTone()};rules?.acknowledge(SystemClock.elapsedRealtime());stopAckRecognition();tts?.stop();ownSpeech=false;dryRun=false;resumeAudioAt=SystemClock.elapsedRealtime()+2000;getSystemService(NotificationManager::class.java).cancel(ALERT);update()}
 private fun startAckRecognition(){
  if(!running||buddyVoice||ownSpeech||rules?.state=="monitoring"||audio.mode!=android.media.AudioManager.MODE_NORMAL)return
  if(!android.speech.SpeechRecognizer.isOnDeviceRecognitionAvailable(this)){lastError="No on-device speech recognizer: acknowledge using Buddy or its notification";return}
  ackRecognizerActive=true;val began=SystemClock.elapsedRealtime()
  fun begin(){if(!ackRecognizerActive||!running||buddyVoice)return;if(captureActive){if(SystemClock.elapsedRealtime()-began>1500){ackRecognizerActive=false;lastError="Voice acknowledgement unavailable; use I’m OK button";return};main.postDelayed({begin()},100);return}
   try{val next=android.speech.SpeechRecognizer.createOnDeviceSpeechRecognizer(this);recognizer=next;next.setRecognitionListener(object:android.speech.RecognitionListener{
    override fun onReadyForSpeech(params:Bundle?){};override fun onBeginningOfSpeech(){};override fun onRmsChanged(rmsdB:Float){};override fun onBufferReceived(buffer:ByteArray?){};override fun onEndOfSpeech(){};override fun onPartialResults(results:Bundle?){};override fun onEvent(type:Int,params:Bundle?){}
    override fun onError(error:Int){if(recognizer===next){stopAckRecognition();resumeAudioAt=SystemClock.elapsedRealtime()+1000}}
    override fun onResults(results:Bundle?){if(recognizer!==next)return;val words=results?.getStringArrayList(android.speech.SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty().lowercase().trim().trimEnd('.','!');stopAckRecognition();if(words.matches(Regex("(?:buddy[, ]+)?(?:i am|i'm|i’m) (?:ok|okay|fine|safe)"))||words in setOf("मैं ठीक हूँ","હું ઠીક છું"))acknowledge()}
   });next.startListening(Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(android.speech.RecognizerIntent.EXTRA_PREFER_OFFLINE,true));main.postDelayed({if(recognizer===next)stopAckRecognition()},8000)
   }catch(e:Exception){stopAckRecognition();lastError="On-device voice acknowledgement unavailable; use I’m OK button"}
  };begin()
 }
 private fun attemptCall(healthcare:Boolean){
  stopAckRecognition();val name=if(healthcare)healthcareName else contactName;val raw=if(healthcare)healthcareNumber else contactNumber
  if(dryRun){callStatus="TEST: "+(if(healthcare)"healthcare"else"family")+" call suppressed";alert(true);return}
  try{require(autoCalls){"Automatic calls are off"};require(checkSelfPermission(android.Manifest.permission.CALL_PHONE)==android.content.pm.PackageManager.PERMISSION_GRANTED){"Phone permission unavailable"};val number=CallNumber.normalize(raw);require(!CallNumber.requiresDialer(number)){"Short emergency service numbers require the phone dialer"};val telephony=getSystemService(android.telephony.TelephonyManager::class.java);require(!telephony.isEmergencyNumber(number)){"Emergency service calls require the system dialer"};require(audio.mode==android.media.AudioManager.MODE_NORMAL){"Another call is active"};getSystemService(android.telecom.TelecomManager::class.java).placeCall(android.net.Uri.fromParts("tel",number,null),Bundle().apply{putBoolean(android.telecom.TelecomManager.EXTRA_START_CALL_WITH_SPEAKERPHONE,true)});callStatus="Call requested through Android to "+name+"; connection not confirmed"
  }catch(e:Exception){callStatus="Automatic call unavailable to "+name+". Tap Call contact to use the phone app.";lastError="Call attempt not confirmed: "+(e.message?:"Android restriction")}
  alert(true)
 }
 private fun update(){val rule=rules;snapshot=JSONObject().put("active",active).put("state",rule?.state?:"off").put("reason",rule?.reason?:"").put("remainingSeconds",if(rule?.state in setOf("check-in","final-warning","family-wait","healthcare-warning"))((rule!!.deadline-SystemClock.elapsedRealtime()).coerceAtLeast(0)/1000)else 0).put("acoustic",acoustic).put("scheduled",scheduled).put("microphoneActive",captureActive).put("lastError",lastError).put("contactName",contactName).put("contactNumber",contactNumber).put("alarmHelp",alarmHelp).put("autoCalls",autoCalls).put("dryRun",dryRun).put("callStatus",callStatus).put("voiceAcknowledgement",android.speech.SpeechRecognizer.isOnDeviceRecognitionAvailable(this)).put("escalation",if(autoCalls)"Repeated voice checks → family call request → healthcare call request"else"On-device alert and user-confirmed contact call")}
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
  when(intent?.action){
   STOP->{stopSelf();return START_NOT_STICKY}
   ACK->{if(rules==null){stopSelf();return START_NOT_STICKY};acknowledge();return START_NOT_STICKY}
   CHECK->{if(rules==null){stopSelf();return START_NOT_STICKY};dryRun=true;rules?.request(SystemClock.elapsedRealtime(),"Test check-in");alert(false);update();return START_NOT_STICKY}
   START->{if(running)return START_NOT_STICKY
    acoustic=intent.getBooleanExtra("acoustic",true);scheduled=intent.getBooleanExtra("scheduled",true);spoken=intent.getBooleanExtra("spoken",true)
    if(!acoustic&&!scheduled){stopSelf();return START_NOT_STICKY}
    alarmHelp=intent.getBooleanExtra("alarmHelp",false);alarmDurationMs=intent.getLongExtra("alarmSeconds",30).coerceIn(15,60)*1000
    autoCalls=intent.getBooleanExtra("autoCalls",false);healthcareName=intent.getStringExtra("healthcareName").orEmpty().take(80);healthcareNumber=intent.getStringExtra("healthcareNumber").orEmpty();callStatus="No call requested"
    contactName=intent.getStringExtra("contactName").orEmpty().take(80);contactNumber=intent.getStringExtra("contactNumber").orEmpty()
    rules=SafetyRules(scheduled,acoustic,intent.getLongExtra("intervalMinutes",30).coerceIn(5,120)*60000,intent.getLongExtra("timeoutSeconds",60).coerceIn(30,180)*1000,intent.getStringExtra("sensitivity")?:"balanced",SystemClock.elapsedRealtime(),autoCalls,intent.getLongExtra("graceMinutes",3).coerceIn(2,10)*60000)
    val type=if(acoustic)ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else if(Build.VERSION.SDK_INT>=34)ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    try{startForeground(MONITOR,monitorNotification(),type)}catch(e:Exception){lastError="Android could not start visible safety monitoring. Open Buddy and start it again.";update();stopSelf();return START_NOT_STICKY}
    active=true;running=true;lastError="";update()
    unlockReceiver=object:android.content.BroadcastReceiver(){override fun onReceive(context:android.content.Context?,intent:Intent?){if(intent?.action==Intent.ACTION_USER_PRESENT&&rules?.state!="monitoring")acknowledge()}};if(Build.VERSION.SDK_INT>=33)registerReceiver(unlockReceiver,android.content.IntentFilter(Intent.ACTION_USER_PRESENT),RECEIVER_NOT_EXPORTED)else registerReceiver(unlockReceiver,android.content.IntentFilter(Intent.ACTION_USER_PRESENT))
    if(spoken){tts=TextToSpeech(this){status->ttsReady=status==TextToSpeech.SUCCESS;val offline=tts?.voices?.firstOrNull{!it.isNetworkConnectionRequired&&it.locale.language==java.util.Locale.getDefault().language};if(offline!=null)tts?.voice=offline else ttsReady=false;tts?.setAudioAttributes(android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_ALARM).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH).build());tts?.setSpeechRate(0.94f)};tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener(){override fun onStart(id:String?){};override fun onDone(id:String?){ownSpeech=false;resumeAudioAt=SystemClock.elapsedRealtime()+2000;main.post{startAckRecognition()}};override fun onError(id:String?){ownSpeech=false};override fun onStop(id:String?,interrupted:Boolean){ownSpeech=false;resumeAudioAt=SystemClock.elapsedRealtime()+1000}})}
    worker=Thread({monitorLoop()},"Buddy-Safety-Local").apply{start()}
   }
   else->{stopSelf()}
  };return START_NOT_STICKY
 }
 private fun releaseMic(){captureActive=false;val old=recorder;recorder=null;runCatching{old?.stop()};runCatching{old?.release()}}
 private fun monitorLoop(){val samples=ShortArray(800);var failures=0
  while(running){var db:Double?=null
   try{
    val paused=buddyVoice||ownSpeech||ackRecognizerActive||audio.mode!=android.media.AudioManager.MODE_NORMAL||SystemClock.elapsedRealtime()<resumeAudioAt
    if(acoustic&&!paused){if(recorder==null){val minimum=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);require(minimum>0);val next=AudioRecord(MediaRecorder.AudioSource.MIC,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,maxOf(minimum,12800));require(next.state==AudioRecord.STATE_INITIALIZED){"Microphone unavailable"};recorder=next;next.startRecording();captureActive=true}
     val count=recorder!!.read(samples,0,samples.size);require(count>0){"Microphone read unavailable"};var sum=0.0;for(i in 0 until count){val v=samples[i]/32768.0;sum+=v*v;samples[i]=0};if(recorder?.activeRecordingConfiguration?.isClientSilenced==true){lastError="Android has silenced the safety microphone; acoustic checks unavailable"}else{db=20*log10(sqrt(sum/count).coerceAtLeast(0.000001));lastError=""};failures=0
    }else{releaseMic();Thread.sleep(200)}
    val level=db;main.post{if(!running)return@post;val now=SystemClock.elapsedRealtime();if(now<alarmUntil&&now-lastBeep>=10000&&!ackRecognizerActive&&!ownSpeech&&audio.mode==android.media.AudioManager.MODE_NORMAL){lastBeep=now;runCatching{if(tone==null)tone=android.media.ToneGenerator(android.media.AudioManager.STREAM_ALARM,100);tone?.startTone(android.media.ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD,1000)}};if(now>=alarmUntil||audio.mode!=android.media.AudioManager.MODE_NORMAL)runCatching{tone?.stopTone()};val notifications=getSystemService(NotificationManager::class.java);if(!notifications.areNotificationsEnabled()||notifications.getNotificationChannel("buddy_safety_alert")?.importance==NotificationManager.IMPORTANCE_NONE){lastError="Safety mode stopped: check-in notifications disabled";stopSelf();return@post};when(rules?.tick(SystemClock.elapsedRealtime(),level,buddyVoice||ownSpeech,audio.mode!=android.media.AudioManager.MODE_NORMAL)){"check-in","repeat","final-warning","healthcare-warning"->alert(false);"escalate"->alert(true);"call-family"->attemptCall(false);"call-healthcare"->attemptCall(true)};update()}
   }catch(e:Exception){releaseMic();failures++;lastError="Microphone temporarily unavailable; acoustic checks are paused";main.post{update()};if(failures>=3){main.post{lastError="Acoustic monitoring stopped: microphone unavailable. Open Buddy to restart.";stopSelf()};break};runCatching{Thread.sleep(1000)}}
  };samples.fill(0);releaseMic()
 }
 override fun onDestroy(){running=false;instance=null;runCatching{unlockReceiver?.let{unregisterReceiver(it)}};unlockReceiver=null;runCatching{tone?.stopTone();tone?.release()};tone=null;stopAckRecognition();active=false;releaseMic();worker?.interrupt();tts?.stop();tts?.shutdown();tts=null;ownSpeech=false;getSystemService(NotificationManager::class.java).cancel(ALERT);stopForeground(STOP_FOREGROUND_REMOVE);snapshot=JSONObject().put("active",false).put("state","off").put("lastError",lastError);super.onDestroy()}
}
