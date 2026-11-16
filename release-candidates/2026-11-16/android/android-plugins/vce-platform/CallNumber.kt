package app.vce.platform

object CallNumber {
 fun normalize(raw:String):String {
  require(raw.matches(Regex("[+0-9 ()-]{3,32}"))){"Use a phone number without extensions or service codes"}
  val result=raw.filter{it.isDigit()||it=='+'}
  require(result.matches(Regex("\\+?[0-9]{3,20}"))){"Invalid phone number"}
  return result
 }
 fun requiresDialer(number:String)=number.count{it.isDigit()}<7
}
