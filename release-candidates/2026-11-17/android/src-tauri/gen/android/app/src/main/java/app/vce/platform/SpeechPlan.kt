package app.vce.platform
import java.text.BreakIterator
import java.util.Locale

data class SpeechChunk(val text:String,val pauseAfterMs:Long)
object SpeechPlan {
 fun build(text:String,locale:Locale,pause:Long):List<SpeechChunk>{
  val output=mutableListOf<SpeechChunk>()
  for(paragraph in text.split(Regex("\\n+"))){
   val clean=paragraph.replace(Regex("^\\s*(?:[•*−-]|[0-9]+[.)])\\s+"),"").trim();if(clean.isBlank())continue
   val boundary=BreakIterator.getSentenceInstance(locale);boundary.setText(clean);var start=boundary.first();var end=boundary.next();val line=mutableListOf<SpeechChunk>()
   while(end!=BreakIterator.DONE){val sentence=clean.substring(start,end).trim();if(sentence.isNotEmpty()){var rest=sentence;while(rest.codePointCount(0,rest.length)>110){val at=rest.lastIndexOf(' ',110).takeIf{it>0}?:rest.offsetByCodePoints(0,110);line.add(SpeechChunk(rest.take(at),pause.coerceAtMost(120)));rest=rest.drop(at).trim()};if(rest.isNotEmpty())line.add(SpeechChunk(rest,pause))};start=end;end=boundary.next()}
   if(line.isNotEmpty()){val last=line.last();line[line.lastIndex]=last.copy(pauseAfterMs=(pause*2).coerceAtMost(1400));output.addAll(line)}
  }
  return output
 }
}
