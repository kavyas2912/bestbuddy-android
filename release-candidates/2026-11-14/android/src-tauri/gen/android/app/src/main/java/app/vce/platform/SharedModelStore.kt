package app.vce.platform

import android.app.Activity
import android.content.ContentUris
import android.content.ContentValues
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/** Public, portable artifact copies. Private verified runtime copies remain isolated from mutable shared files. */
class SharedModelStore(private val activity:Activity){
 companion object { private val folderLock=Any() }
 private val resolver=activity.contentResolver
 private val prefs=activity.getSharedPreferences("buddy-shared-models",0)
 private val collection=MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
 private val relative=Environment.DIRECTORY_DOWNLOADS+"/Models/"
 private val legacyRelative=Environment.DIRECTORY_DOWNLOADS+"/models/"
 fun uri(sha:String):String?=prefs.getString(sha,null)?.takeIf{value->runCatching{resolver.openFileDescriptor(Uri.parse(value),"r")?.use{it.statSize>0}?:false}.getOrDefault(false)}
 @Synchronized fun publish(model:JSONObject,file:File):String{
  val digest=model.getString("sha256")
  uri(digest)?.let{existing->
   val check=MessageDigest.getInstance("SHA-256");var count=0L
   val matches=runCatching{resolver.openInputStream(Uri.parse(existing))?.use{input->val buffer=ByteArray(1024*1024);while(true){val n=input.read(buffer);if(n<0)break;check.update(buffer,0,n);count+=n}};count==model.getLong("bytes")&&check.digest().joinToString(""){"%02x".format(it.toInt() and 255)}==digest}.getOrDefault(false)
   if(matches)return existing
   // A user-edited shared file is retained; publish a new verified copy instead of overwriting it.
   prefs.edit().remove(digest).apply()
  }
  val name=model.getString("filename").removeSuffix(".litertlm").replace(Regex("[^A-Za-z0-9._-]"),"_").take(110)+"-"+digest.take(12)+".litertlm"
  val values=ContentValues().apply{put(MediaStore.Downloads.DISPLAY_NAME,name);put(MediaStore.Downloads.MIME_TYPE,"application/octet-stream");put(MediaStore.Downloads.RELATIVE_PATH,relative);put(MediaStore.Downloads.IS_PENDING,1)}
  val target=resolver.insert(collection,values)?:throw IllegalStateException("Could not create Downloads/models file")
  try{
   val hash=MessageDigest.getInstance("SHA-256");var bytes=0L
   file.inputStream().buffered().use{input->resolver.openOutputStream(target,"w")?.use{output->val buf=ByteArray(1024*1024);while(true){val n=input.read(buf);if(n<0)break;output.write(buf,0,n);hash.update(buf,0,n);bytes+=n};output.flush()}?:throw IllegalStateException("Downloads/models is not writable")}
   val actual=hash.digest().joinToString(""){"%02x".format(it.toInt() and 255)}
   require(actual==digest&&bytes==model.getLong("bytes")){"Model changed while copying; public file was not published"}
   resolver.update(target,ContentValues().apply{put(MediaStore.Downloads.IS_PENDING,0)},null,null)
   prefs.edit().putString(digest,target.toString()).apply();return target.toString()
  }catch(e:Exception){resolver.delete(target,null,null);throw e}
 }
 fun ensureFolder(){synchronized(folderLock){
  val saved=prefs.getString("folderMarker",null)
  if(saved!=null&&runCatching{resolver.openFileDescriptor(Uri.parse(saved),"r")?.use{true}?:false}.getOrDefault(false))return
  val values=ContentValues().apply{put(MediaStore.Downloads.DISPLAY_NAME,"BestBuddy-models.txt");put(MediaStore.Downloads.MIME_TYPE,"text/plain");put(MediaStore.Downloads.RELATIVE_PATH,relative);put(MediaStore.Downloads.IS_PENDING,1)}
  val target=resolver.insert(collection,values)?:throw IllegalStateException("Could not create Downloads/Models")
  try{
   resolver.openOutputStream(target,"w")?.use{it.write("BestBuddy stores verified conversation models here. The app scans this folder automatically.".toByteArray(Charsets.UTF_8))}?:throw IllegalStateException("Could not initialize model folder")
   resolver.update(target,ContentValues().apply{put(MediaStore.Downloads.IS_PENDING,0)},null,null)
   prefs.edit().putString("folderMarker",target.toString()).apply()
  }catch(e:Exception){resolver.delete(target,null,null);throw e}
 }
 }
 fun scan():JSONArray{
  ensureFolder()
  val result=JSONArray()
  resolver.query(collection,arrayOf(MediaStore.Downloads._ID,MediaStore.Downloads.DISPLAY_NAME,MediaStore.Downloads.SIZE),"(${MediaStore.Downloads.RELATIVE_PATH} = ? OR ${MediaStore.Downloads.RELATIVE_PATH} = ?) AND ${MediaStore.Downloads.IS_PENDING} = 0",arrayOf(relative,legacyRelative),null)?.use{c->while(c.moveToNext()&&result.length()<1000){val name=c.getString(1).orEmpty();if(name.endsWith(".litertlm",true)||name.endsWith(".gguf",true)||name.endsWith(".tflite",true))result.put(JSONObject().put("uri",ContentUris.withAppendedId(collection,c.getLong(0)).toString()).put("name",name).put("bytes",c.getLong(2)).put("compatible",name.endsWith(".litertlm",true)))}}
  return result
 }
}
