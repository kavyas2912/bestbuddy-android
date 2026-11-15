package app.vce.platform
import org.junit.Assert.*
import org.junit.Test
class SafetyRulesTest {
 @Test fun scheduledCheckInEscalatesOnlyAfterDeadline(){val r=SafetyRules(true,false,60000,30000);assertNull(r.tick(59000));assertEquals("check-in",r.tick(60000));assertNull(r.tick(89999));assertEquals("escalate",r.tick(90000));assertNull(r.tick(100000))}
 @Test fun acknowledgementCancelsEscalationAndResetsInterval(){val r=SafetyRules(true,false,60000,30000);r.tick(60000);r.acknowledge(70000);assertNull(r.tick(90000));assertEquals("monitoring",r.state);assertEquals("check-in",r.tick(130000))}
 @Test fun briefNoiseAndCalibrationDoNotTrigger(){val r=SafetyRules(false,true,60000,30000);assertNull(r.tick(1000,-5.0));assertNull(r.tick(6000,-10.0));assertNull(r.tick(6500,-60.0));assertEquals("monitoring",r.state)}
 @Test fun sustainedRelativeLoudSoundTriggersCheckIn(){val r=SafetyRules(false,true,60000,30000);for(t in 0L..4800L step 200)r.tick(t,-60.0);assertNull(r.tick(6000,-10.0));assertEquals("check-in",r.tick(6800,-10.0))}
 @Test fun buddyVoiceSuppressesAcousticAndScheduledTriggers(){val r=SafetyRules(true,true,60000,30000);assertNull(r.tick(70000,-5.0,true));assertEquals("monitoring",r.state);assertEquals("check-in",r.tick(71000,null,false))}
 @Test fun repeatedLoudSoundHasCooldownAfterAck(){val r=SafetyRules(false,true,60000,30000);r.request(6000);r.acknowledge(7000);assertNull(r.tick(13000,-5.0));assertNull(r.tick(14000,-5.0));assertEquals("monitoring",r.state)}
 @Test fun automaticChainRepeatsWarnsAndCallsEachStageOnce(){val r=SafetyRules(false,true,60000,60000,autoCalls=true);r.request(0);assertEquals("repeat",r.tick(20000));assertEquals("repeat",r.tick(40000));assertEquals("final-warning",r.tick(60000));assertEquals("call-family",r.tick(90000));assertNull(r.tick(100000));assertEquals("healthcare-warning",r.tick(270000));assertEquals("call-healthcare",r.tick(300000));assertNull(r.tick(400000))}
 @Test fun acknowledgementStopsHealthcareEscalation(){val r=SafetyRules(false,true,60000,60000,autoCalls=true);r.request(0);r.tick(20000);r.tick(40000);r.tick(60000);r.tick(90000);r.acknowledge(100000);assertNull(r.tick(300000));assertEquals("monitoring",r.state)}
 @Test fun existingCallDelaysHealthcareCountdown(){val r=SafetyRules(false,true,60000,60000,autoCalls=true);r.request(0);r.tick(20000);r.tick(40000);r.tick(60000);r.tick(90000);assertNull(r.tick(270000,null,false,true));assertNull(r.tick(300000));assertEquals("healthcare-warning",r.tick(450000))}
 @Test fun finalWarningCanBeCancelledBeforeFamilyCall(){val r=SafetyRules(false,true,60000,60000,autoCalls=true);r.request(0);r.tick(20000);r.tick(40000);r.tick(60000);r.acknowledge(80000);assertNull(r.tick(90000));assertEquals("monitoring",r.state)}

}
