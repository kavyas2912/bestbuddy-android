package app.vce.platform

/** Relative sound energy only: no speech recognition, recording, diagnosis or fall classification. */
class SafetyRules(val scheduled:Boolean,val acoustic:Boolean,val intervalMs:Long,val timeoutMs:Long,val sensitivity:String="balanced",startMs:Long=0,val autoCalls:Boolean=false,val graceMs:Long=180000){
 var state="monitoring";private set
 var reason="";private set
 var deadline=0L;private set
 private var reminders=0
 private var lastCheck=startMs
 private var warmUntil=startMs+5000
 private var baseline=-55.0
 private var loudSince:Long?=null
 private var lastEvent=startMs-300000
 fun tick(now:Long,db:Double?=null,voiceBusy:Boolean=false,callActive:Boolean=false):String?{
  if(autoCalls){
   if(state=="check-in"&&now>=deadline){if(reminders<2){reminders++;deadline=now+timeoutMs/3;return "repeat"};state="final-warning";deadline=now+30000;return "final-warning"}
   if(state=="final-warning"&&now>=deadline){if(callActive){deadline=now+30000;return null};state="family-wait";deadline=now+graceMs;return "call-family"}
   if(state=="family-wait"){if(callActive){deadline=now+graceMs;return null};if(now>=deadline){state="healthcare-warning";deadline=now+30000;return "healthcare-warning"}}
   if(state=="healthcare-warning"&&now>=deadline){if(callActive){deadline=now+30000;return null};state="escalated";return "call-healthcare"}
  }else if(state=="check-in"&&now>=deadline){state="escalated";return "escalate"}
  if(state!="monitoring")return null
  if(scheduled&&now-lastCheck>=intervalMs&&!voiceBusy)return request(now,"Scheduled check-in")
  if(!acoustic||db==null||voiceBusy){loudSince=null;return null}
  if(now<warmUntil){baseline=baseline*0.9+db*0.1;return null}
  val delta=when(sensitivity){"high"->12.0;"low"->24.0;else->18.0}
  val floor=when(sensitivity){"high"->-30.0;"low"->-12.0;else->-22.0}
  val threshold=maxOf(baseline+delta,floor)
  if(db>=threshold){if(loudSince==null)loudSince=now;if(now-loudSince!!>=200&&now-lastEvent>=300000){lastEvent=now;return request(now,"Loud-sound check-in")}}else{loudSince=null;if(db<baseline+6)baseline=baseline*0.98+db*0.02}
  return null
 }
 fun request(now:Long,why:String="Manual check-in"):String{state="check-in";reason=why;deadline=now+if(autoCalls)timeoutMs/3 else timeoutMs;reminders=0;lastCheck=now;loudSince=null;return "check-in"}
 fun acknowledge(now:Long){state="monitoring";reason="";deadline=0;reminders=0;lastCheck=now;lastEvent=now;loudSince=null;warmUntil=now+5000}
}
