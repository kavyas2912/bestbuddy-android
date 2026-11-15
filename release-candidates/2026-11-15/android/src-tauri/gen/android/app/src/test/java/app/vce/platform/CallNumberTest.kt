package app.vce.platform
import org.junit.Assert.*
import org.junit.Test

class CallNumberTest {
 @Test fun normalizesSelectedNumber(){assertEquals("+919876543210",CallNumber.normalize("+91 (98765) 43210"))}
 @Test fun rejectsServiceCodesAndInjectedSchemes(){for(value in listOf("*123#","tel:+919876543210","+91;123","++12345","123,456","1+234567")){try{CallNumber.normalize(value);fail("Accepted $value")}catch(expected:IllegalArgumentException){}}}
 @Test fun shortNumbersUseDialer(){assertTrue(CallNumber.requiresDialer("112"));assertFalse(CallNumber.requiresDialer("+919876543210"))}
}
