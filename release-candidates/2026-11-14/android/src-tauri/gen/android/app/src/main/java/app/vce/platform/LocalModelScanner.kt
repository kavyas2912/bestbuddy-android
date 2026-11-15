package app.vce.platform
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject

class LocalModelScanner(private val activity:Activity,private val models:ModelController){
 private val allowed=java.util.concurrent.ConcurrentHashMap<String,String>()
 private val prefs=activity.getSharedPreferences("buddy-model-scan",0)
 fun downloads(call:Invoke){
 val saved=prefs.getString("tree",null)
 
 CoroutineScope(Dispatchers.IO).launch{try{val rows=SharedModelStore(activity).scan();if(rows.length()==0&&saved!=null){scan(call,Uri.parse(saved));return@launch};for(i in 0 until rows.length()){val row=rows.getJSONObject(i);allowed[row.getString("uri")]=row.getString("name")};call.resolve(JSObject().put("files",rows).put("folder","Downloads/Models").put("message","Downloads/Models checked automatically. Other apps’ files may require folder access."))}catch(e:Exception){call.reject("Could not scan Downloads/Models; use Choose model folder or Import file")}}}
 fun scan(call:Invoke,tree:Uri){CoroutineScope(Dispatchers.IO).launch{try{
  val flags=Intent.FLAG_GRANT_READ_URI_PERMISSION
  runCatching{activity.contentResolver.takePersistableUriPermission(tree,flags)}
  val rows=JSONArray();var visited=0
  fun walk(parent:String,depth:Int){if(depth>4||visited>=1000)return;val uri=DocumentsContract.buildChildDocumentsUriUsingTree(tree,parent)
   activity.contentResolver.query(uri,arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_SIZE),null,null,null)?.use{c->while(c.moveToNext()&&visited++<1000){val id=c.getString(0);val name=c.getString(1).orEmpty();val mime=c.getString(2);if(mime==DocumentsContract.Document.MIME_TYPE_DIR){walk(id,depth+1)}else if(name.endsWith(".litertlm",true)||name.endsWith(".gguf",true)||name.endsWith(".tflite",true)||name.startsWith("sha256-")){val file=DocumentsContract.buildDocumentUriUsingTree(tree,id);allowed[file.toString()]=name;rows.put(JSONObject().put("uri",file.toString()).put("name",name).put("bytes",c.getLong(3)).put("compatible",name.endsWith(".litertlm",true)).put("reason",if(name.endsWith(".litertlm",true))"Import and SHA256 verification required"else"GGUF/TFLite is not a LiteRT-LM conversation artifact"))}}}?:throw IllegalStateException("Saved model folder could not be read. Choose the folder again in Model settings.")
  }
  walk(DocumentsContract.getTreeDocumentId(tree),0);prefs.edit().putString("tree",tree.toString()).apply();call.resolve(JSObject().put("files",rows).put("visited",visited).put("limited",visited>=1000))
 }catch(e:Exception){call.reject("Could not scan this folder. Select a model folder or individual file in the Android picker.")}}}
 fun selectFile(call:Invoke,uri:Uri){CoroutineScope(Dispatchers.IO).launch{try{var name="model.litertlm";activity.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())name=it.getString(0)};allowed[uri.toString()]=name;models.importFile(call,uri,name)}catch(e:Exception){call.reject("Could not read the selected model file")}}}
 fun import(call:Invoke,args:JSONObject){val uri=args.optString("uri");val name=allowed[uri];if(name==null){call.reject("Select or scan this file with Android's picker first");return};models.importFile(call,Uri.parse(uri),name)}
}
