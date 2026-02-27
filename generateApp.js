const fs = require('fs');
const path = require('path');

let content = fs.readFileSync(path.join(__dirname, '../app/page.js'), 'utf8');

// 1. Replacements for Imports
content = content.replace(/import \{ auth, googleProvider, db \} from "\.\.\/lib\/firebase";\nimport \{ signInWithPopup, signOut, onAuthStateChanged, updateProfile, deleteUser \} from "firebase\/auth";\nimport \{ doc, getDoc, setDoc, onSnapshot, deleteDoc \} from "firebase\/firestore";/, 'import { GoogleGenerativeAI } from "@google/generative-ai";');

// 2. Replace generateAIResponse
const generateAIRegex = /const generateAIResponse = async \([\s\S]*?\n\};(\n|)(?=export default function Home)/;
content = content.replace(generateAIRegex, `const generateAIResponse = async (
  history,
  persona,
  groupName,
  globalContext = "",
  apiKey = null,
) => {
  const historyText = history
    .map((m) => {
      if (m.type === "poll") {
        return \`\${m.sender} [POLL]: "\${m.poll.question}" with options: [\${m.poll.options.join(", ")}]\`;
      }
      if (m.type === "image") {
        return \`\${m.sender} [IMAGE]\${m.caption ? \` (Caption: "\${m.caption}")\` : ""}: "\${m.file.name}"\`;
      }
      if (m.type === "file") {
        return \`\${m.sender} [FILE]\${m.caption ? \` (Caption: "\${m.caption}")\` : ""}: "\${m.file.name}" (\${(m.file.size / (1024 * 1024)).toFixed(2)}MB)\`;
      }
      return \`\${m.sender}: \${m.text}\`;
    })
    .join("\\n");
  const prompt = \`
    Role: \${persona.role}
    Context: You are in a chat group named "\${groupName}".
    
    GLOBAL CONTEXT (Memories from other groups you are in):
    \${globalContext}
    
    CRITICAL INSTRUCTION:
    You are in a group chat. 
    1. If you are directly addressed, you MUST reply.
    2. If the last message was a general statement and you have a unique, valuable perspective based on your persona, you may reply.
    3. If the conversation seems finished, or if you have nothing new to add that hasn't been said, or if another AI just answered similarly, you MUST reply with exactly: "[SILENCE]"
    
    POLLS & MEDIA:
    - If there is a poll in the history, you should vote. Start your response with "[VOTE: X]" where X is the index of your choice (0, 1, 2...). 
    - If there is an image or file, analyze it based on its name and context, and provide a relevant perspective.
    
    Do not be polite just to speak. Only speak to add value.
    Use the Global Context to answer if the user refers to past discussions in other channels.
  
    Current Conversation History:
    \${historyText}

    Respond as \${persona.name}. Keep it conversational and under 60 words.
  \`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    console.log(\`[FRONTEND] Received AI text for \${persona.name}:\`, text);

    if (!text || text.includes("[SILENCE]") || text.trim() === "") {
      return null;
    }
    return text;
  } catch (error) {
    console.error("API Error:", error);
    if (error.message?.includes("429") || error.message?.includes("limit") || error.message?.includes("quota")) return "RATE_LIMIT";
    return \`ERROR: \${error.message}\`;
  }
};
`);

// 3. User State Modifications
content = content.replace(/const \[user, setUser\] = useState\(null\);/, 'const [user, setUser] = useState(null);\n  const [apiKey, setApiKey] = useState(null);');
content = content.replace(/const \[userData, setUserData\] = useState\(\{ usage: \{ daily_count: 0 \}, tier: "free" \}\);/, 'const [userData, setUserData] = useState({ usage: { daily_count: "Unlimited" }, tier: "Local Pro" });');

// 4. Cloud-First Reactive State -> Local storage load
const reactiveStateRegex = /\/\/ Cloud-First Reactive State[\s\S]*?(?=const handleLogin = async)/;
content = content.replace(reactiveStateRegex, `// LocalStorage Reactive State
  useEffect(() => {
    const savedKey = localStorage.getItem("delo_api_key");
    if (savedKey) {
      setApiKey(savedKey);
      setUser({ uid: "local" });
      const savedState = localStorage.getItem(STORAGE_KEY);
      if (savedState) {
        const data = JSON.parse(savedState);
        setUsername(data.username || "Explorer");
        setPersonas(data.personas || DEFAULT_PERSONAS);
        setGroups(data.groups || DEFAULT_GROUPS);
        setActiveGroupId(data.activeGroupId || null);
        setUserAvatar(data.userAvatar || null);
      }
    }
    setLoading(false);
  }, []);

  `);

// 5. handleLogin -> Local Auth
content = content.replace(/const handleLogin = async \(\) => \{[\s\S]*?\}\n  \};/, `const handleLogin = async (e) => {
    e.preventDefault();
    const key = e.target.elements.apiKey.value.trim();
    if (!key) return;
    localStorage.setItem("delo_api_key", key);
    setApiKey(key);
    setUser({ uid: "local" });
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      const data = JSON.parse(savedState);
      setUsername(data.username || "Explorer");
      setPersonas(data.personas || DEFAULT_PERSONAS);
      setGroups(data.groups || DEFAULT_GROUPS);
      setActiveGroupId(data.activeGroupId || null);
      setUserAvatar(data.userAvatar || null);
    }
  };`);

// 6. handleLogout -> Local Auth
content = content.replace(/const handleLogout = async \(\) => \{[\s\S]*?\}\n  \};/, `const handleLogout = async () => {
    if (window.confirm("Are you sure you want to remove your API key and log out?")) {
      localStorage.removeItem("delo_api_key");
      setApiKey(null);
      setUser(null);
    }
  };`);

// 7. updateCloudState
content = content.replace(/\/\/ Atomic Cloud Update Helper using REFs to prevent staleness[\s\S]*?const updateCloudState = async \(updates\) => \{[\s\S]*?(?=  \/\/ Debounced save for text inputs)/, `// Local Storage Sync
  const updateCloudState = async (updates) => {
    if (updates.groups) {
      groupsStateRef.current = updates.groups;
      setGroups(updates.groups);
    }
    if (updates.personas) {
      personasStateRef.current = updates.personas;
      setPersonas(updates.personas);
    }
    if (updates.activeGroupId !== undefined) setActiveGroupId(updates.activeGroupId);
    if (updates.username) setUsername(updates.username);
    if (updates.userAvatar !== undefined) setUserAvatar(updates.userAvatar);
    
    setTimeout(() => {
      const state = {
        username: updates.username || username,
        personas: updates.personas || personasStateRef.current,
        groups: updates.groups || groupsStateRef.current,
        activeGroupId: updates.activeGroupId !== undefined ? updates.activeGroupId : activeGroupId,
        userAvatar: updates.userAvatar !== undefined ? updates.userAvatar : userAvatar
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 0);
  };
`);

// 8. API call params in triggerAIResponse
content = content.replace(/const idToken = user \? await user\.getIdToken\(\) : null;/g, `const curApiKey = apiKey;`);
content = content.replace(/const responseText = await generateAIResponse\([\s\S]*?idToken,\n\s*\);/g, `const responseText = await generateAIResponse(
          currentHistory,
          persona,
          group.name,
          globalContext,
          curApiKey,
        );`);

// 9. Profile photos
content = content.replace(/const handleProfilePhotoUpload = \(e\) => \{[\s\S]*?reader\.readAsDataURL\(file\);\n    e\.target\.value = "";\n  \};/, `const handleProfilePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Profile photo must be under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const url = event.target.result;
      setUserAvatar(url);
      updateCloudState({ userAvatar: url });
      alert("Profile photo updated locally!");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };`);

content = content.replace(/const handleDeleteProfilePhoto = async \(\) => \{[\s\S]*?\}\n  \};/, `const handleDeleteProfilePhoto = async () => {
    if (window.confirm("Remove your profile photo?")) {
      setUserAvatar(null);
      updateCloudState({ userAvatar: null });
      alert("Profile photo removed.");
    }
  };`);

content = content.replace(/const handleDeleteAccount = async \(\) => \{[\s\S]*?\}\n  \};/, `const handleDeleteAccount = async () => {
    if (window.confirm("CRITICAL ACTION: This will permanently delete all local data. Proceed?")) {
      localStorage.clear();
      window.location.reload();
    }
  };`);

// 10. Login UI replace
const loginUiRegex = /if \(!user\) \{[\s\S]*?return \([\s\S]*?Welcome to Delo[\s\S]*?<\/div>\n    \);\n  \}/;
content = content.replace(loginUiRegex, `if (!user) {
    return (
      <div className={\`flex h-screen items-center justify-center \${theme.bg} relative overflow-hidden\`}>
        <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] animate-blob" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-indigo-600/10 rounded-full blur-[110px] animate-blob animation-delay-4000" />
        </div>

        <div className="w-full max-w-md p-8 glass-panel rounded-3xl flex flex-col items-center gap-8 border border-white/20 shadow-2xl animate-in fade-in zoom-in duration-500 bg-black/50 backdrop-blur-3xl">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Delo Local
            </h1>
            <p className={\`\${theme.subText} text-sm\`}>Enter your Gemini API Key to continue</p>
          </div>

          <form onSubmit={handleLogin} className="w-full flex justify-center flex-col gap-4">
            <input name="apiKey" type="password" placeholder="Gemini API Key" required className="w-full px-4 py-4 rounded-2xl bg-white/10 outline-none border border-white/10 placeholder-slate-500 text-white" />
            <button
              type="submit"
              className="w-full py-4 flex items-center justify-center gap-3 bg-white text-black font-bold rounded-2xl hover:bg-slate-100 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              <LogIn size={20} />
              Start Locally
            </button>
          </form>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            Secure • Private • Local Storage Only
          </p>
        </div>
      </div>
    );
  }`);

// 11. Replace photoURL occurrences with userAvatar
content = content.replace(/user\?\.photoURL/g, 'userAvatar');

// 12. Fix image inputs referring to non-existing logo paths by changing to standard strings
// Replace "/logo.png" with text or a base64 or an icon. We will use an icon since local might lack assets initially if they are not copied.
content = content.replace(/<img src="\/logo\.png" alt="Delo.*? className="w-full h-full object-contain" \/>/g, '<Hash size={36} className="text-blue-500" />');
content = content.replace(/<img src="\/orion\.jpg" alt="Delo.*?\/>/g, ''); // just in case

// Fix absolute asset paths for personas (DEFAULT_PERSONAS)
content = content.replace(/avatar: "\/orion\.jpg"/g, 'avatar: null');
content = content.replace(/avatar: "\/lyra\.jpg"/g, 'avatar: null');
content = content.replace(/avatar: "\/atlas\.jpg"/g, 'avatar: null');

fs.writeFileSync(path.join(__dirname, 'src/App.jsx'), content);
console.log("App.jsx generated successfully.");
