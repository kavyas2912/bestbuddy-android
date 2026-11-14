package app.vce.platform
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Only an encrypted token blob is persisted; the encryption key never leaves Android Keystore. */
class HfTokenStore(context:Context){
 private val prefs=context.getSharedPreferences("buddy-hf-auth-v1",0)
 private val alias="buddy.huggingface.token.v1"
 private fun key():SecretKey{val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)};val existing=store.getKey(alias,null)as?SecretKey;if(existing!=null)return existing;return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())}.generateKey()}
 fun configured()=prefs.contains("cipher")
 @Synchronized fun save(token:String){val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());val encoded=cipher.doFinal(token.toByteArray(Charsets.UTF_8));check(prefs.edit().putString("cipher",Base64.encodeToString(encoded,Base64.NO_WRAP)).putString("iv",Base64.encodeToString(cipher.iv,Base64.NO_WRAP)).commit()){"Could not save the token"}}
 @Synchronized fun read():String?{val encrypted=prefs.getString("cipher",null)?:return null;val iv=Base64.decode(prefs.getString("iv",null)?:return null,Base64.NO_WRAP);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,iv));return String(cipher.doFinal(Base64.decode(encrypted,Base64.NO_WRAP)),Charsets.UTF_8)}
 @Synchronized fun clear(){prefs.edit().clear().commit();KeyStore.getInstance("AndroidKeyStore").apply{load(null);if(containsAlias(alias))deleteEntry(alias)}}
}
