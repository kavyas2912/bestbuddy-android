package app.vce.platform
import org.junit.Assert.*
import org.junit.Test
import java.util.Locale
class SpeechPlanTest {
 @Test fun sentencesHavePauses(){val chunks=SpeechPlan.build("Hello! How are you? Let us talk.",Locale.ENGLISH,350);assertEquals(3,chunks.size);assertEquals(350L,chunks[0].pauseAfterMs);assertTrue(chunks.last().pauseAfterMs>=700)}
 @Test fun paragraphAndBulletsAreNatural(){val chunks=SpeechPlan.build("• First item.\n• Second item.",Locale.ENGLISH,300);assertEquals(2,chunks.size);assertFalse(chunks.any{it.text.contains("•")});assertTrue(chunks.all{it.pauseAfterMs==600L})}
 @Test fun decimalsAndEmptyTextAreSafe(){val chunks=SpeechPlan.build("The value is 3.14. That is the number.",Locale.ENGLISH,350);assertTrue(chunks.any{it.text.contains("3.14")});assertTrue(SpeechPlan.build("  ",Locale.ENGLISH,350).isEmpty())}
 @Test fun longSentencesAreBounded(){val chunks=SpeechPlan.build("word ".repeat(1500),Locale.ENGLISH,350);assertTrue(chunks.size>1);assertTrue(chunks.all{it.text.length<=1500})}
}
