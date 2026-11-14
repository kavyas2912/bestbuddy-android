// ui/src/seed.js — pre-seeded content so first launch is instant (replaced by prefetch as it refreshes)
export const SEED = {
  greet: {
    morning: ["Good morning, {n}! I'm up, caffeinated on pure electricity, and ready.", "Rise and shine, {n}! The day is fresh and I haven't broken anything yet."],
    afternoon: ["Good afternoon, {n}! Lunch is a great idea, by the way. I'm only saying.", "Hello again, {n}! Pleasantly present and at your service."],
    evening: ["Good evening, {n}! Let's wind the day down gracefully.", "Evening, {n}! I saved you the comfy chair in my imagination."]
  },
  onboard: ["Hello! I'm Buddy. I run on your phone. Online content uses your chosen permissions.", "Tap the glowing orb to talk, or type if you're feeling shy. I promise not to judge your accent."],
  phrasebook: [
    { m: ["hi", "hello", "hey", "hi buddy", "hello buddy"], r: "Hello, {n}! Lovely to hear from you. What shall we do?" },
    { m: ["good morning"], r: "Good morning, {n}! May your tea be hot and your news be good." },
    { m: ["good night", "goodnight"], r: "Good night, {n}. Sleep well; I'll keep the lights of the internet off." },
    { m: ["thank you", "thanks"], r: "My pleasure, {n}. Gratitude noted, and returned." },
    { m: ["how are you"], r: "Running smoothly, fully charged, mildly witty. And you?" },
    { m: ["tell me a joke", "joke"], r: "Why did the phone go to therapy? Too many unresolved notifications." },
    { m: ["bye", "goodbye"], r: "Goodbye, {n}! I'll be right here, quietly prefetching." }
  ],
  commands: [
    { c: "Give me my day brief", i: "🌅" }, { c: "What's the weather", i: "⛅" }, { c: "Read the news", i: "📰" },
    { c: "How are the markets", i: "📈" }, { c: "What's on my schedule", i: "🗓️" }, { c: "Tell me a joke", i: "😄" },
    { c: "Play some music", i: "🎵" }, { c: "Switch language", i: "🌐" }
  ],
  plugins: [["Weather", "⛅", 1], ["News", "📰", 1], ["Markets", "📈", 1], ["Schedule", "🗓️", 1], ["Music", "🎵", 0], ["Video", "🎬", 0]],
  langs: ["English", "Hindi", "Gujarati", "Spanish", "French", "German"],
  brief: {
    weather: "Weather not fetched yet. Set your city in Settings, Content & Prefetch.",
    schedule: "Nothing scheduled yet. Say 'remind me to ...' to add something.",
    news: "Headlines not fetched yet.",
    markets: "Market data not fetched yet."
  }
};
