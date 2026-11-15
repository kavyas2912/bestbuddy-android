package app.vce.platform

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import android.telephony.TelephonyManager
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject

/** System contact picker grants access only to the selected phone row. Calls require a native confirmation. */
class ContactCalls(private val activity:Activity){
 data class Target(val name:String,val number:String)
 private var active:Invoke?=null
 fun picked(call:Invoke,uri:Uri){try{
  require(uri.scheme=="content"&&uri.authority==ContactsContract.AUTHORITY){"Invalid contact provider"}
  activity.contentResolver.query(uri,arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,ContactsContract.CommonDataKinds.Phone.NUMBER),null,null,null)?.use{cursor->require(cursor.moveToFirst()){ "Contact has no selected number" };val name=cursor.getString(0).orEmpty().take(80);val number=normalize(cursor.getString(1).orEmpty());call.resolve(JSObject().put("name",name).put("number",number));return}
  call.reject("Could not read the selected contact")
 }catch(e:Exception){call.reject("Could not read that contact number. You can add it manually.")}}
 private fun normalize(raw:String)=CallNumber.normalize(raw)
 private fun dialOnly(number:String)=CallNumber.requiresDialer(number)||runCatching{(activity.getSystemService(Activity.TELEPHONY_SERVICE) as TelephonyManager).isEmergencyNumber(number)}.getOrDefault(true)
 fun confirm(call:Invoke,onApproved:(Target)->Unit){
  if(active!=null){call.reject("Finish the current call confirmation first");return}
  val args=call.getArgs();val target=try{Target(args.optString("name","Contact").take(80),normalize(args.optString("number")))}catch(e:Exception){call.reject(e.message);return}
  active=call;val dial=dialOnly(target.number)
  AlertDialog.Builder(activity).setTitle(if(dial)"Open phone dialer?"else"Call this contact?").setMessage(target.name+"\n"+target.number+if(dial)"\nConfirm the call in your phone app."else"\nYour phone may ask for call permission or SIM selection.").setNegativeButton("Cancel"){_,_->active=null;call.resolve(JSObject().put("cancelled",true))}.setPositiveButton(if(dial)"Open dialer"else"Call"){_,_->active=null;if(dial)place(call,target,false)else onApproved(target)}.setOnCancelListener{active=null;call.resolve(JSObject().put("cancelled",true))}.show()
 }
 fun place(call:Invoke,target:Target,direct:Boolean){try{activity.startActivity(Intent(if(direct&&!dialOnly(target.number))Intent.ACTION_CALL else Intent.ACTION_DIAL,Uri.fromParts("tel",target.number,null)));call.resolve(JSObject().put("action",if(direct)"call requested"else"dialer opened"))}catch(e:SecurityException){try{activity.startActivity(Intent(Intent.ACTION_DIAL,Uri.fromParts("tel",target.number,null)));call.resolve(JSObject().put("action","dialer opened; direct calling unavailable"))}catch(e:Exception){call.reject("No phone app is available")}}catch(e:Exception){call.reject("Could not open the phone app")}}
}
