package app.vce.platform

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/** Private, verified runtime files extracted from this APK; never a network download. */
object BundledAssets {
 @Volatile private var installed=false
 fun root(context:Context)=File(context.filesDir,"buddy-default-resources")
 fun ready(context:Context)=installed||File(root(context),"verified-v1.json").isFile
 @Synchronized fun ensure(context:Context,onProgress:(String)->Unit={}) {
  if(installed)return
  val manifest=JSONObject(context.assets.open("buddy-default-manifest.json").bufferedReader().use{it.readText()})
  val files=manifest.getJSONArray("files");val base=root(context).canonicalFile
  base.mkdirs();val preferences=context.getSharedPreferences("buddy-bundled-assets-v1",0)
  for(i in 0 until files.length()){
   val row=files.getJSONObject(i);val relative=row.getString("path");val hash=row.getString("sha256")
   require(relative.isNotBlank()&&!relative.startsWith("/")&&!relative.contains("\\")){"Invalid bundled path"}
   val target=File(base,relative).canonicalFile
   require(target.toPath().startsWith(base.toPath())&&target!=base){"Invalid bundled path"}
   if(target.isFile&&target.length()==row.getLong("bytes")&&preferences.getString(relative,"")==hash)continue
   onProgress("Preparing "+relative.substringBefore('/'))
   target.parentFile!!.mkdirs();val temporary=File(target.parentFile,target.name+".installing")
   val digest=MessageDigest.getInstance("SHA-256")
   context.assets.open("buddy-default/"+relative).use{input->FileOutputStream(temporary).use{output->
    val buffer=ByteArray(1024*1024);while(true){val n=input.read(buffer);if(n<0)break;output.write(buffer,0,n);digest.update(buffer,0,n)};output.fd.sync()
   }}
   val actual=digest.digest().joinToString(""){"%02x".format(it.toInt() and 255)}
   require(actual==hash&&temporary.length()==row.getLong("bytes")){"Bundled resource verification failed: $relative"}
   require(temporary.renameTo(target)){"Could not finish resource setup: $relative"}
   preferences.edit().putString(relative,hash).apply()
  }
  File(base,"verified-v1.json").writeText(manifest.toString());installed=true
 }
}
