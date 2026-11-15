package app.vce.platform
import android.app.Activity
import android.content.Intent
import android.net.Uri
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import org.json.JSONArray
import org.json.JSONObject

class Connections(private val activity:Activity){
 private val catalog=JSONArray(activity.assets.open("vce-connections.json").bufferedReader().use{it.readText()})
 fun list(call:Invoke){val result=JSONArray();for(i in 0 until catalog.length()){val row=JSONObject(catalog.getJSONObject(i).toString());row.put("installed",activity.packageManager.getLaunchIntentForPackage(row.getString("package"))!=null);result.put(row)};call.resolve(JSObject().put("apps",result))}
 fun open(call:Invoke){val id=call.getArgs().optString("id");val row=(0 until catalog.length()).map{catalog.getJSONObject(it)}.firstOrNull{it.getString("id")==id};if(row==null){call.reject("Unknown connection");return};activity.runOnUiThread{try{val packageName=row.getString("package");val uri=Uri.parse(row.getString("url"));val view=Intent(Intent.ACTION_VIEW,uri).setPackage(packageName);val launch=if(view.resolveActivity(activity.packageManager)!=null)view else activity.packageManager.getLaunchIntentForPackage(packageName);if(launch!=null){activity.startActivity(launch);call.resolveObject(mapOf("opened" to "app"))}else{activity.startActivity(Intent(Intent.ACTION_VIEW,uri));call.resolveObject(mapOf("opened" to "web"))}}catch(e:Exception){call.reject("This connection could not be opened on this device")}}}
}
