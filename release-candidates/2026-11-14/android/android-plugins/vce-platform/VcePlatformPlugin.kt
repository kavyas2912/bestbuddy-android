package app.vce.platform
import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import androidx.appcompat.app.AppCompatActivity
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.*
import org.json.JSONObject

@InvokeArg class EventsArgs { var onEvent:Channel?=null }
@TauriPlugin(permissions=[Permission(strings=[Manifest.permission.RECORD_AUDIO],alias="microphone"),Permission(strings=[Manifest.permission.CALL_PHONE],alias="phone"),Permission(strings=[Manifest.permission.POST_NOTIFICATIONS],alias="safetyNotifications")])
class VcePlatformPlugin(private val host:Activity):Plugin(host){
 private var channel:Channel?=null
 private lateinit var voice:VoiceController
 private lateinit var models:ModelController
 private lateinit var localModels:LocalModelScanner
 private lateinit var connections:Connections
 private lateinit var contactCalls:ContactCalls
 private var safetyStartEpoch=0L
 private var safetyPermissionCall:Invoke?=null
 private var voiceStartEpoch=0L
 private var phoneCall:Invoke?=null
 private var phoneTarget:ContactCalls.Target?=null
 private var phoneApprovalAt=0L
 private var permissionCall:Invoke?=null
 private fun event(data:JSONObject){if(data.optString("type")=="voice")SafetyMonitorService.voiceState(data.optString("state"));channel?.send(JSObject(data.toString()))}
 override fun load(webView:WebView){voice=VoiceController(host,::event);models=ModelController(host,::event);localModels=LocalModelScanner(host,models);connections=Connections(host);voice.initialize();contactCalls=ContactCalls(host)}
 private fun beginVoiceListen(call:Invoke){val ticket=++voiceStartEpoch;SafetyMonitorService.voiceState("listening");val started=android.os.SystemClock.elapsedRealtime();fun waitForMic(){if(ticket!=voiceStartEpoch){call.reject("cancelled");return};if(!SafetyMonitorService.captureActive&&!SafetyMonitorService.ackRecognizerActive){voice.listen(call,call.getArgs());return};if(android.os.SystemClock.elapsedRealtime()-started>1500){SafetyMonitorService.voiceState("idle");call.reject("Safety microphone is releasing; tap Talk again");return};android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({waitForMic()},100)};waitForMic()}
 @Command fun safetyStatus(call:Invoke){val result=JSONObject(SafetyMonitorService.snapshot.toString());if(host.intent.getBooleanExtra("buddy_safety_call",false)){result.put("callRequested",true).put("callName",host.intent.getStringExtra("buddy_safety_name")).put("callNumber",host.intent.getStringExtra("buddy_safety_number"));host.intent.removeExtra("buddy_safety_call");host.intent.removeExtra("buddy_safety_name");host.intent.removeExtra("buddy_safety_number")};call.resolve(JSObject(result.toString()))}
 @Command fun safetyStart(call:Invoke){host.runOnUiThread{if(safetyPermissionCall!=null){call.reject("Complete the safety permission request first");return@runOnUiThread};val args=call.getArgs();if(!args.optBoolean("confirmed")||(!args.optBoolean("acoustic")&&!args.optBoolean("scheduled"))){call.reject("Review safety mode and select at least one check-in trigger first");return@runOnUiThread};safetyStartEpoch++;safetyPermissionCall=call;if(args.optBoolean("acoustic")&&getPermissionState("microphone")!=PermissionState.GRANTED)requestPermissionForAlias("microphone",call,"safetyMicrophoneResult")else safetyNotificationPermission(call)}}
 @PermissionCallback private fun safetyMicrophoneResult(call:Invoke){host.runOnUiThread{if(safetyPermissionCall !== call)return@runOnUiThread;if(getPermissionState("microphone")!=PermissionState.GRANTED){safetyPermissionCall=null;call.reject("Microphone permission is required only for acoustic checks. You can use scheduled check-ins instead.");return@runOnUiThread};safetyNotificationPermission(call)}}
 private fun safetyNotificationPermission(call:Invoke){if(android.os.Build.VERSION.SDK_INT>=33&&getPermissionState("safetyNotifications")!=PermissionState.GRANTED)requestPermissionForAlias("safetyNotifications",call,"safetyNotificationResult")else safetyPhonePermission(call)}
 @PermissionCallback private fun safetyNotificationResult(call:Invoke){host.runOnUiThread{if(safetyPermissionCall !== call)return@runOnUiThread;if(android.os.Build.VERSION.SDK_INT>=33&&getPermissionState("safetyNotifications")!=PermissionState.GRANTED){safetyPermissionCall=null;call.reject("Enable Buddy notifications before starting safety mode");return@runOnUiThread};safetyPhonePermission(call)}}
 private fun safetyPhonePermission(call:Invoke){if(call.getArgs().optBoolean("autoCalls")&&getPermissionState("phone")!=PermissionState.GRANTED)requestPermissionForAlias("phone",call,"safetyPhoneResult")else startSafetySession(call)}
 @PermissionCallback private fun safetyPhoneResult(call:Invoke){host.runOnUiThread{if(safetyPermissionCall !== call)return@runOnUiThread;if(getPermissionState("phone")!=PermissionState.GRANTED){safetyPermissionCall=null;call.reject("Automatic safety calls require phone permission. Switch automatic calling off for on-phone alerts only.");return@runOnUiThread};startSafetySession(call)}}
 private fun startSafetySession(call:Invoke){safetyPermissionCall=null;if(!host.getSystemService(android.app.NotificationManager::class.java).areNotificationsEnabled()){call.reject("Enable Buddy notifications in Android settings before starting safety check-ins");return};val args=call.getArgs();val ticket=safetyStartEpoch;android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({try{require(ticket==safetyStartEpoch){"Safety start cancelled"};require(host.hasWindowFocus()){"Open Buddy and press Start safety mode again"};val intent=Intent(host,SafetyMonitorService::class.java).setAction(SafetyMonitorService.START).putExtra("acoustic",args.optBoolean("acoustic")).putExtra("scheduled",args.optBoolean("scheduled")).putExtra("spoken",args.optBoolean("spoken",true)).putExtra("intervalMinutes",args.optLong("intervalMinutes",30)).putExtra("timeoutSeconds",args.optLong("timeoutSeconds",60)).putExtra("sensitivity",args.optString("sensitivity","balanced")).putExtra("autoCalls",args.optBoolean("autoCalls")).putExtra("alarmHelp",args.optBoolean("alarmHelp")).putExtra("alarmSeconds",args.optLong("alarmSeconds",30)).putExtra("healthcareName",args.optString("healthcareName").take(80)).putExtra("healthcareNumber",args.optString("healthcareNumber")).putExtra("graceMinutes",args.optLong("graceMinutes",3)).putExtra("contactName",args.optString("contactName").take(80));if(args.optBoolean("autoCalls")){require(args.optBoolean("autoCallsConfirmed")){"Review and enable the automatic escalation consent"};for(key in listOf("contactNumber","healthcareNumber")){val candidate=CallNumber.normalize(args.optString(key));require(!CallNumber.requiresDialer(candidate)&&!(host.getSystemService(android.telephony.TelephonyManager::class.java)).isEmergencyNumber(candidate)){"Choose full family and healthcare contact numbers. Short/public emergency services require the system dialer."}}};val number=args.optString("contactNumber");if(number.isNotBlank())intent.putExtra("contactNumber",CallNumber.normalize(number));host.startForegroundService(intent);call.resolve(JSObject().put("starting",true))}catch(e:Exception){call.reject(e.message?:"Could not start safety mode")}},300)}
 @Command fun safetyStop(call:Invoke){host.runOnUiThread{safetyStartEpoch++;safetyPermissionCall?.reject("cancelled");safetyPermissionCall=null;host.stopService(Intent(host,SafetyMonitorService::class.java));call.resolve()}}
 @Command fun safetyAcknowledge(call:Invoke){host.runOnUiThread{if(SafetyMonitorService.active)host.startService(Intent(host,SafetyMonitorService::class.java).setAction(SafetyMonitorService.ACK));call.resolve()}}
 @Command fun safetyCheckNow(call:Invoke){host.runOnUiThread{if(!SafetyMonitorService.active){call.reject("Start safety mode first");return@runOnUiThread};host.startService(Intent(host,SafetyMonitorService::class.java).setAction(SafetyMonitorService.CHECK));call.resolve()}}
 @Command fun events(call:Invoke){channel=call.parseArgs(EventsArgs::class.java).onEvent;call.resolve()}
 @Command fun status(call:Invoke){host.runOnUiThread{call.resolveObject(voice.status())}}
 @Command fun speak(call:Invoke){voice.speak(call,call.getArgs())}
 @Command fun listen(call:Invoke){host.runOnUiThread{
  if(getPermissionState("microphone")==PermissionState.GRANTED)beginVoiceListen(call)
  else {permissionCall?.reject("cancelled");permissionCall=call;requestPermissionForAlias("microphone",call,"microphoneResult")}
 }}
 @PermissionCallback private fun microphoneResult(call:Invoke){host.runOnUiThread{
  if(permissionCall !== call)return@runOnUiThread
  permissionCall=null
  if(getPermissionState("microphone")==PermissionState.GRANTED)beginVoiceListen(call) else call.reject("Allow microphone access in Android app settings to use Talk")
 }}
 private fun quiet(){voiceStartEpoch++;permissionCall?.reject("cancelled");permissionCall=null;voice.stop();models.cancel()}
 @Command fun stop(call:Invoke){host.runOnUiThread{quiet();call.resolve()}}
 @Command fun models(call:Invoke){models.status(call)}
 @Command fun scanDownloadsModels(call:Invoke){localModels.downloads(call)}
 @Command fun exportModel(call:Invoke){models.exportModel(call,call.getArgs())}
 @Command fun checkModelAccess(call:Invoke){models.checkAccess(call,call.getArgs())}
 @Command fun scanModels(call:Invoke){host.runOnUiThread{try{quiet();startActivityForResult(call,Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION),"folderResult")}catch(e:Exception){call.reject("Folder picker unavailable; use Import model file")}}}
 @ActivityCallback private fun folderResult(call:Invoke,result:ActivityResult){val uri=result.data?.data;if(result.resultCode!=Activity.RESULT_OK||uri==null){call.resolve(JSObject().put("files",org.json.JSONArray()).put("cancelled",true));return};localModels.scan(call,uri)}
 @Command fun chooseModelFile(call:Invoke){host.runOnUiThread{try{quiet();startActivityForResult(call,Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),"modelFileResult")}catch(e:Exception){call.reject("File picker unavailable")}}}
 @ActivityCallback private fun modelFileResult(call:Invoke,result:ActivityResult){val uri=result.data?.data;if(result.resultCode!=Activity.RESULT_OK||uri==null){call.resolve();return};localModels.selectFile(call,uri)}
 @Command fun importModel(call:Invoke){localModels.import(call,call.getArgs())}
 @Command fun downloadModel(call:Invoke){models.download(call,call.getArgs())}
 @Command fun connections(call:Invoke){host.runOnUiThread{connections.list(call)}}
 @Command fun openConnection(call:Invoke){host.runOnUiThread{quiet();connections.open(call)}}
 @Command fun housekeeping(call:Invoke){models.housekeeping(call,call.getArgs().optBoolean("clearCache"))}
 @Command fun modelOptions(call:Invoke){models.options(call,call.getArgs())}
 @Command fun pauseDownload(call:Invoke){models.pauseDownload();call.resolve()}
 @Command fun resetDownload(call:Invoke){models.reset(call,call.getArgs())}
 @Command fun selectModel(call:Invoke){models.select(call,call.getArgs())}
 @Command fun generate(call:Invoke){models.generate(call,call.getArgs())}
 @Command fun probe(call:Invoke){models.generate(call,call.getArgs(),true)}
 @Command fun remember(call:Invoke){models.remember(call,call.getArgs())}
 @Command fun clearSession(call:Invoke){models.unload(true);call.resolve()}
 @Command fun unload(call:Invoke){models.unload();call.resolve()}
 @Command fun openSpeechSettings(call:Invoke){launch(call,Intent("com.android.settings.TTS_SETTINGS"))}
 @Command fun openRecognitionSettings(call:Invoke){launch(call,Intent(android.provider.Settings.ACTION_VOICE_INPUT_SETTINGS))}
 @Command fun openLink(call:Invoke){
  val target=call.getArgs().optString("url")
  if(target=="device:music"){launch(call,Intent.makeMainSelectorActivity(Intent.ACTION_MAIN,Intent.CATEGORY_APP_MUSIC));return}
  val uri=Uri.parse(target);if(uri.scheme!="https"||uri.host.isNullOrBlank()||uri.userInfo!=null){call.reject("Only HTTPS destinations are allowed");return}
  launch(call,Intent(Intent.ACTION_VIEW,uri))
 }
 @Command fun pickContact(call:Invoke){host.runOnUiThread{try{quiet();startActivityForResult(call,Intent(Intent.ACTION_PICK,android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI).setType(android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_TYPE),"contactResult")}catch(e:Exception){call.reject("Contact picker unavailable. Add a name and number manually.")}}}
 @ActivityCallback private fun contactResult(call:Invoke,result:ActivityResult){val uri=result.data?.data;if(result.resultCode!=Activity.RESULT_OK||uri==null){call.resolve(JSObject().put("cancelled",true));return};contactCalls.picked(call,uri)}
 @Command fun callContact(call:Invoke){host.runOnUiThread{if(SafetyMonitorService.active)host.startService(Intent(host,SafetyMonitorService::class.java).setAction(SafetyMonitorService.ACK));if(phoneCall!=null){call.reject("Complete the current phone permission request first");return@runOnUiThread};quiet();contactCalls.confirm(call){target->if(getPermissionState("phone")==PermissionState.GRANTED)contactCalls.place(call,target,true)else{phoneCall=call;phoneTarget=target;phoneApprovalAt=android.os.SystemClock.elapsedRealtime();requestPermissionForAlias("phone",call,"phoneResult")}}}}
 @PermissionCallback private fun phoneResult(call:Invoke){host.runOnUiThread{if(phoneCall !== call)return@runOnUiThread;val target=phoneTarget;phoneCall=null;phoneTarget=null;if(target==null||android.os.SystemClock.elapsedRealtime()-phoneApprovalAt>120000){call.reject("Call confirmation expired; select the contact again");return@runOnUiThread};contactCalls.place(call,target,getPermissionState("phone")==PermissionState.GRANTED)}}
 @Command fun dial(call:Invoke){val number=call.getArgs().optString("number");if(!call.getArgs().optBoolean("confirmed")||!number.matches(Regex("[+0-9 ()-]{3,32}"))){call.reject("Confirm a valid safety phone number first");return};launch(call,Intent(Intent.ACTION_DIAL,Uri.fromParts("tel",number,null)))}
 private fun launch(call:Invoke,intent:Intent){host.runOnUiThread{try{quiet();host.startActivity(intent);call.resolve()}catch(e:Exception){call.reject("No suitable app is available for this action")}}}
 override fun onPause(activity:AppCompatActivity){if(permissionCall==null)quiet()}
 override fun onStop(activity:AppCompatActivity){quiet();models.pauseDownload();models.unload()}
 override fun onDestroy(activity:AppCompatActivity){voice.close();models.close();channel=null}
}
