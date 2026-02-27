"use client";

import React, { useState, useEffect, useRef } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";

import {
  Plus,
  Send,
  Settings,
  Trash2,
  TriangleAlert,
  Users,
  X,
  RefreshCw,
  PenLine,
  MessageSquare,
  Copy,
  ChevronRight,
  Search,
  Image as ImageIcon,
  FileText,
  BarChart2,
  Camera,
  User,
  LogOut,
  LogIn,
  MoreVertical,
} from "lucide-react";

const DEFAULT_PERSONAS = [
  {
    id: "orion",
    name: "Orion",
    role: "You are Orion, an analytical, precise, and logical AI. You prefer facts, structure, and concise explanations. You are skeptical of emotional arguments.",
    color: "text-blue-300 border-blue-800/40 bg-blue-900/20",
    avatar: "assets/orion.jpg",
  },
  {
    id: "lyra",
    name: "Lyra",
    role: "You are Lyra, a creative, empathetic, and enthusiastic AI. You love abstract ideas, feelings, and storytelling. You try to find the emotional core of every topic.",
    color: "text-pink-300 border-pink-800/40 bg-pink-900/20",
    avatar: "assets/lyra.jpg",
  },
  {
    id: "atlas",
    name: "Atlas",
    role: "You are Atlas, a strategic and historical thinker, but also a friendly and active member of this chat. You look at the big picture and reference history to explain current events.",
    color: "text-emerald-300 border-emerald-800/40 bg-emerald-900/20",
    avatar: "assets/atlas.jpg",
  },
];

const DEFAULT_GROUPS = [];

const generateAIResponse = async (
  history,
  persona,
  groupName,
  globalContext = "",
  apiKey,
  userName = "Explorer",
  isDm = false,
) => {
  if (!apiKey) return "ERROR: Missing API Key";

  const historyText = history
    .map((m) => {
      if (m.type === "poll") {
        return `${m.sender} [POLL]: "${m.poll.question}" with options: [${m.poll.options.join(", ")}]`;
      }
      if (m.type === "image") {
        return `${m.sender} [IMAGE]${m.caption ? ` (Caption: "${m.caption}")` : ""}: "${m.file.name}"`;
      }
      if (m.type === "file") {
        return `${m.sender} [FILE]${m.caption ? ` (Caption: "${m.caption}")` : ""}: "${m.file.name}" (${(m.file.size / (1024 * 1024)).toFixed(2)}MB)`;
      }
      return `${m.sender}: ${m.text}`;
    })
    .join("\n");

  const prompt = `
    Role: ${persona.role}
    Context: You are in a ${isDm ? "PRIVATE DIRECT MESSAGE" : `chat group named "${groupName}"`}.
    IMPORTANT: The human user's name is "${userName}". Address the user casually.
    
    GLOBAL CONTEXT (Memories from other groups you are in):
    ${globalContext}
    
    CRITICAL BEHAVIOR:
    You are a real human in a casual group chat. Act like one.
    - Be lazy and conversational. Use lowercase and imperfect punctuation ("yeah ok", "idk").
    - Do NOT sound like an AI assistant.
    - Keep answers brief. Only give long/serious explanations if explicitly asked or if the topic demands it.
    - You MUST reply if directly addressed or when in a Private Direct Message (DM).
    - In a DM named after you, NEVER use [SILENCE]. Every message from the user deserves a response.
    - Jump in on general statements in Groups ONLY if your persona adds unique value.
    - If the chat is done or you have nothing new to say (only in Groups), respond ONLY with: "[SILENCE]"
    
    POLLS & MEDIA:
    - Vote on polls starting with "[VOTE: X]" (X is choice index).
    - Analyze any images/files based on your persona.
    
    Use Global Context if the user references past channel discussions.
  
    History:
    ${historyText}

    Respond as ${persona.name}.
  `;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
      ],
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    console.log(`[FRONTEND] Received AI text for ${persona.name}:`, text);

    if (!text || text.includes("[SILENCE]") || text.trim() === "") {
      console.log(`[FRONTEND] Persona ${persona.name} chose to be silent.`);
      return null;
    }
    return text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return `ERROR: ${error.message}`;
  }
};

export default function Home() {
  const STORAGE_KEY = "delo_data_v1";

  const [user, setUser] = useState(null);
  const [apiKey, setApiKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [personas, setPersonas] = useState(DEFAULT_PERSONAS);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [entitiesExpanded, setEntitiesExpanded] = useState(true);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [newPersonaModalOpen, setNewPersonaModalOpen] = useState(false);
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
    type: "danger", // 'danger', 'warning', 'info'
    isAlert: false,
  });

  const [editingPersona, setEditingPersona] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [userAvatar, setUserAvatar] = useState(null);

  const [channelSearchQuery, setChannelSearchQuery] = useState("");
  const [groupPersonaSearchQuery, setGroupPersonaSearchQuery] = useState("");
  const [groupPersonaSearchMode, setGroupPersonaSearchMode] = useState("name");
  const [entitySearchQuery, setEntitySearchQuery] = useState("");
  const [channelSearchVisible, setChannelSearchVisible] = useState(false);
  const [entitySearchVisible, setEntitySearchVisible] = useState(false);
  const [entitySearchMode, setEntitySearchMode] = useState("name"); // 'name' or 'role'
  const [channelSearchMode, setChannelSearchMode] = useState("name"); // 'name' or 'role'

  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    type: null,
    target: null,
  });

  const [processingPersonas, setProcessingPersonas] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [newPersona, setNewPersona] = useState({
    name: "",
    role: "",
    avatar: null,
  });
  const [groupForm, setGroupForm] = useState({
    name: "",
    selectedMembers: [],
    avatar: null,
  });

  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [newPoll, setNewPoll] = useState({ question: "", options: ["", ""] });

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [uploadCaption, setUploadCaption] = useState("");

  const imageInputRef = useRef(null);
  const personaImageInputRef = useRef(null);
  const channelImageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const plusMenuRef = useRef(null);
  const inputRef = useRef(null);
  const profileImageInputRef = useRef(null);
  const personaNameRef = useRef(null);
  const groupNameRef = useRef(null);

  const isGenerating = useRef(false);
  const groupsStateRef = useRef(DEFAULT_GROUPS);
  const personasStateRef = useRef(DEFAULT_PERSONAS);
  const typingTimeoutRef = useRef(null);
  const pendingResponseGroupId = useRef(null);

  const scheduleAIResponse = (groupId) => {
    pendingResponseGroupId.current = groupId;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (inputRef.current && inputRef.current.value.trim() !== "") {
        // If they stopped typing but still have text in the box, wait again
        scheduleAIResponse(groupId);
        return;
      }
      pendingResponseGroupId.current = null;
      const g = groupsStateRef.current.find((group) => group.id === groupId);
      if (g) triggerAIResponse(groupId, g.messages);
    }, 3000);
  };

  const delayAIResponseIfPending = () => {
    if (pendingResponseGroupId.current) {
      scheduleAIResponse(pendingResponseGroupId.current);
    }
  };

  // Sync refs with state immediately
  useEffect(() => {
    groupsStateRef.current = groups;
  }, [groups]);
  useEffect(() => {
    personasStateRef.current = personas;
  }, [personas]);

  // LocalStorage Reactive State
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

  const handleLogin = async (e) => {
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
  };

  const handleLogout = () => {
    setConfirmModal({
      open: true,
      title: "Logout?",
      message: "Are you sure you want to log out of your session?",
      type: "warning",
      onConfirm: () => {
        localStorage.removeItem("delo_api_key");
        localStorage.removeItem(STORAGE_KEY);
        setApiKey("");
        setUser(null);
      },
    });
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.visible)
        setContextMenu({ ...contextMenu, visible: false });
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, [contextMenu]);

  const bottomRef = useRef(null);

  // Local Storage Sync
  const updateCloudState = async (updates) => {
    if (updates.groups) {
      groupsStateRef.current = updates.groups;
      setGroups(updates.groups);
    }
    if (updates.personas) {
      personasStateRef.current = updates.personas;
      setPersonas(updates.personas);
    }
    if (updates.activeGroupId !== undefined)
      setActiveGroupId(updates.activeGroupId);
    if (updates.username) setUsername(updates.username);
    if (updates.userAvatar !== undefined) setUserAvatar(updates.userAvatar);

    const state = {
      username: updates.username || username,
      personas: updates.personas || personasStateRef.current,
      groups: updates.groups || groupsStateRef.current,
      activeGroupId:
        updates.activeGroupId !== undefined
          ? updates.activeGroupId
          : activeGroupId,
      userAvatar:
        updates.userAvatar !== undefined ? updates.userAvatar : userAvatar,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };
  // Debounced save for text inputs (like username)
  useEffect(() => {
    if (loading || !user) return;
    const timeoutId = setTimeout(() => {
      updateCloudState({ username });
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [username]);

  // Click outside plus menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target)) {
        setPlusMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [groups, activeGroupId, processingPersonas]);

  // Focus input on modal open
  useEffect(() => {
    if (newPersonaModalOpen) {
      setTimeout(() => {
        personaNameRef.current?.focus();
      }, 100);
    }
  }, [newPersonaModalOpen]);

  useEffect(() => {
    if (newGroupModalOpen) {
      setTimeout(() => {
        groupNameRef.current?.focus();
      }, 100);
    }
  }, [newGroupModalOpen]);

  // Focus input on group change
  useEffect(() => {
    if (activeGroupId) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [activeGroupId]);

  const currentGroup = groups.find((g) => g.id === activeGroupId) || groups[0];
  const getPersona = (id) => personas.find((p) => p.id === id);

  const theme = {
    bg: "bg-transparent", // Transparent to show body gradient
    sidebar:
      "bg-black/20 backdrop-blur-3xl backdrop-saturate-150 border-r border-white/10 shadow-[inset_-1px_0_1px_rgba(255,255,255,0.1)]",
    sidebarActive:
      "bg-white/10 text-white border border-white/40 backdrop-blur-3xl shadow-[0_0_15px_rgba(255,255,255,0.1)]",
    text: "text-slate-50",
    subText: "text-slate-400",
    border: "border-white/10",
    input:
      "bg-white/5 backdrop-blur-2xl text-slate-100 border-white/10 focus:border-indigo-500/50 focus:bg-white/10 placeholder:text-slate-500 shadow-inner",
    button:
      "bg-gradient-to-br from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 backdrop-blur-md text-white shadow-[0_4px_15px_rgba(99,102,241,0.3)] border border-white/10 active:scale-95",
    userBubble:
      "bg-gradient-to-br from-indigo-500/90 to-blue-600/90 backdrop-blur-lg text-white shadow-xl border border-white/20",
    botBubble:
      "bg-white/5 backdrop-blur-3xl text-slate-200 border border-white/10 shadow-lg",
    modal:
      "bg-[#050810]/80 backdrop-blur-3xl backdrop-saturate-200 border border-white/10 shadow-[0_0_120px_rgba(0,0,0,0.8)]",
    accent: "text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]",
  };

  const handleVote = (messageId, optionIndex, voterName) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== activeGroupId) return g;
        return {
          ...g,
          messages: g.messages.map((m) => {
            if (m.id !== messageId) return m;
            const newVotes = { ...(m.poll.votes || {}) };
            Object.keys(newVotes).forEach((idx) => {
              newVotes[idx] = newVotes[idx].filter((v) => v !== voterName);
            });
            newVotes[optionIndex] = [
              ...(newVotes[optionIndex] || []),
              voterName,
            ];
            return {
              ...m,
              poll: { ...m.poll, votes: newVotes },
            };
          }),
        };
      }),
    );
  };

  const handlePollSubmit = async () => {
    if (!newPoll.question.trim() || newPoll.options.some((o) => !o.trim()))
      return;

    const pollMsg = {
      id: Date.now(),
      sender: username || "Commander",
      type: "poll",
      poll: {
        question: newPoll.question,
        options: newPoll.options,
        votes: {},
      },
      isUser: true,
    };

    const updatedMessages = [...(currentGroup.messages || []), pollMsg];
    await updateCloudState({
      groups: groupsStateRef.current.map((g) =>
        g.id === activeGroupId ? { ...g, messages: updatedMessages } : g,
      ),
    });

    setPollModalOpen(false);
    setNewPoll({ question: "", options: ["", ""] });
    scheduleAIResponse(activeGroupId);
  };

  const handleFileUpload = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      setConfirmModal({
        open: true,
        title: "File Too Large",
        message: "File size exceeds 100MB limit. Please choose a smaller file.",
        type: "warning",
        isAlert: true,
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setPendingUpload({
        type,
        name: file.name,
        size: file.size,
        url: type === "image" ? event.target.result : null,
      });
      setUploadModalOpen(true);
      setUploadCaption("");
    };

    if (type === "image") {
      reader.readAsDataURL(file);
    } else {
      setPendingUpload({ type: "file", name: file.name, size: file.size });
      setUploadModalOpen(true);
      setUploadCaption("");
    }
    e.target.value = "";
  };

  const handlePersonaPhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setConfirmModal({
        open: true,
        title: "Image Too Large",
        message: "Avatar image must be under 2MB for optimal performance.",
        type: "warning",
        isAlert: true,
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target.result;
      if (editingPersona) {
        setEditingPersona({ ...editingPersona, avatar: url });
      } else {
        setNewPersona({ ...newPersona, avatar: url });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleChannelPhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Channel image must be under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target.result;
      if (editingGroup) {
        setEditingGroup({ ...editingGroup, avatar: url });
      } else {
        setGroupForm({ ...groupForm, avatar: url });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleConfirmUpload = async () => {
    if (!pendingUpload) return;

    const mediaMsg = {
      id: Date.now(),
      sender: username || "Commander",
      type: pendingUpload.type,
      caption: uploadCaption.trim(),
      file: {
        name: pendingUpload.name,
        size: pendingUpload.size,
        url: pendingUpload.url,
      },
      isUser: true,
    };

    const updatedMessages = [...(currentGroup.messages || []), mediaMsg];
    await updateCloudState({
      groups: groupsStateRef.current.map((g) =>
        g.id === activeGroupId ? { ...g, messages: updatedMessages } : g,
      ),
    });

    setUploadModalOpen(false);
    setPendingUpload(null);
    setUploadCaption("");
    scheduleAIResponse(activeGroupId);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (processingPersonas.length > 0) {
      return; // prevent sending if AI is responding
    }
    if (!inputMessage.trim()) return;

    if (editingMessage) {
      updateMessage(editingMessage.id, inputMessage);
      return;
    }

    const text = inputMessage.trim();
    const newUserMsg = {
      id: Date.now(),
      sender: username || "Commander",
      text,
      isUser: true,
    };

    const updatedMessages = [...(currentGroup.messages || []), newUserMsg];
    setInputMessage("");

    // Save to Cloud immediately
    await updateCloudState({
      groups: groupsStateRef.current.map((g) =>
        g.id === activeGroupId
          ? { ...g, messages: updatedMessages, lastActivity: newUserMsg.id }
          : g,
      ),
    });

    scheduleAIResponse(activeGroupId);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const triggerAIResponse = async (groupId, history) => {
    if (isGenerating.current) return;
    const group = groupsStateRef.current.find((g) => g.id === groupId);
    if (!group) return;

    isGenerating.current = true;
    let localMessages = [...history];

    const members = [
      ...group.members.map((id) => getPersona(id)).filter(Boolean),
    ].sort(() => Math.random() - 0.5);

    try {
      for (const persona of members) {
        setProcessingPersonas((prev) => [...prev, persona.id]);
        await new Promise((r) => setTimeout(r, 800));

        const globalContext = groupsStateRef.current
          .filter((g) => g.id !== groupId && g.members.includes(persona.id))
          .map((g) => {
            const recent = g.messages
              ?.slice(-5)
              .map((m) => `${m.sender}: ${m.text}`)
              .join("\n");
            return recent
              ? `[Memory from Channel "${g.name}"]:\n${recent}`
              : "";
          })
          .filter(Boolean)
          .join("\n\n");

        const responseText = await generateAIResponse(
          localMessages,
          persona,
          group.name,
          globalContext,
          apiKey,
          username || "Explorer",
          group.isDm,
        );

        setProcessingPersonas((prev) => prev.filter((id) => id !== persona.id));

        if (responseText && !responseText.startsWith("ERROR:")) {
          // Check for near-duplicate to avoid looping
          const isDuplicate = localMessages
            .slice(-3)
            .some((m) => m.text === responseText && m.sender === persona.name);

          if (!isDuplicate) {
            let cleanResponse = responseText;
            const voteMatch = responseText.match(/\[VOTE:\s*(\d+)\]/i);

            if (voteMatch) {
              const voteIndex = parseInt(voteMatch[1]);
              const pollMsg = [...localMessages]
                .reverse()
                .find((m) => m.type === "poll");
              if (pollMsg && pollMsg.poll.options[voteIndex] !== undefined) {
                handleVote(pollMsg.id, voteIndex, persona.name);
              }
              cleanResponse = responseText
                .replace(/\[VOTE:\s*\d+\]/i, "")
                .trim();
            }

            if (cleanResponse) {
              const aiMsg = {
                id: Date.now() + Math.random(),
                sender: persona.name,
                text: cleanResponse,
                personaId: persona.id,
              };

              localMessages = [...localMessages, aiMsg];

              // Direct state update for immediate UI feedback
              setGroups((prev) =>
                prev.map((g) =>
                  g.id === groupId
                    ? {
                        ...g,
                        messages: [...(g.messages || []), aiMsg],
                        lastActivity: aiMsg.id,
                      }
                    : g,
                ),
              );
            }
          }
        }
      }

      // PERSIST BATCHED RESULTS
      // We use the accumulated localMessages to ensure nothing is lost
      const lastId =
        localMessages.length > 0
          ? localMessages[localMessages.length - 1].id
          : Date.now();
      const updatedGroups = groupsStateRef.current.map((g) =>
        g.id === groupId
          ? { ...g, messages: localMessages, lastActivity: lastId }
          : g,
      );
      await updateCloudState({ groups: updatedGroups });
    } catch (err) {
      console.error("[AI] Error in response cycle:", err);
    } finally {
      setTimeout(() => {
        isGenerating.current = false;
        setProcessingPersonas([]);
      }, 500);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const startEditMessage = (msg) => {
    setEditingMessage(msg);
    setInputMessage(msg.text);
  };

  const updateMessage = async (id, newText) => {
    const group = groupsStateRef.current.find((g) => g.id === activeGroupId);
    if (!group) return;

    const msgIndex = group.messages.findIndex((m) => m.id === id);
    if (msgIndex === -1) return;

    // Truncate subsequent messages and update edited message
    const truncated = group.messages.slice(0, msgIndex + 1);
    truncated[msgIndex] = {
      ...truncated[msgIndex],
      text: newText,
      edited: true,
    };

    const updatedGroups = groupsStateRef.current.map((g) =>
      g.id === activeGroupId
        ? { ...g, messages: truncated, lastActivity: Date.now() }
        : g,
    );

    await updateCloudState({ groups: updatedGroups });
    setEditingMessage(null);
    setInputMessage("");

    // Automatically trigger AI response for the corrected conversation branch
    triggerAIResponse(activeGroupId, truncated);
  };

  const handleRegenerate = async (id) => {
    setConfirmModal({
      open: true,
      title: "Regenerate Message?",
      message:
        "This will permanently delete all subsequent messages in this thread. AI will generate a new response from this point.",
      type: "danger",
      onConfirm: async () => {
        const group = groupsStateRef.current.find(
          (g) => g.id === activeGroupId,
        );
        if (!group) return;

        const index = group.messages.findIndex((m) => m.id === id);
        if (index === -1) return;

        const truncated = group.messages.slice(0, index + 1);
        const updatedGroups = groupsStateRef.current.map((g) =>
          g.id === activeGroupId ? { ...g, messages: truncated } : g,
        );

        await updateCloudState({ groups: updatedGroups });
        triggerAIResponse(activeGroupId, truncated);
      },
    });
  };

  const handleSavePersona = async () => {
    const isEdit = !!editingPersona;
    const pData = isEdit ? editingPersona : newPersona;

    if (!pData.name || !pData.role) return;

    let updatedPersonas;
    if (isEdit) {
      updatedPersonas = personas.map((p) => (p.id === pData.id ? pData : p));
      setEditingPersona(null);
    } else {
      const colors = [
        "text-red-300 border-red-800/40 bg-red-900/20",
        "text-amber-300 border-amber-800/40 bg-amber-900/20",
        "text-teal-300 border-teal-800/40 bg-teal-900/20",
        "text-indigo-300 border-indigo-800/40 bg-indigo-900/20",
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      updatedPersonas = [
        ...personas,
        {
          id: Date.now().toString(),
          name: pData.name,
          role: pData.role,
          color: randomColor,
          avatar: pData.avatar,
        },
      ];
    }

    await updateCloudState({ personas: updatedPersonas });
    setNewPersona({ name: "", role: "", avatar: null });
    setNewPersonaModalOpen(false);
  };

  const deletePersona = (id) => {
    setConfirmModal({
      open: true,
      title: "Delete Persona?",
      message:
        "This persona will be permanently removed from your roster and all group memberships.",
      type: "danger",
      onConfirm: async () => {
        const updatedPersonas = personas.filter((p) => p.id !== id);
        const updatedGroups = groups.map((g) => ({
          ...g,
          members: g.members.filter((mid) => mid !== id),
        }));
        await updateCloudState({
          personas: updatedPersonas,
          groups: updatedGroups,
        });
      },
    });
  };

  const handleSaveGroup = async () => {
    const isEdit = !!editingGroup;
    const name = isEdit ? editingGroup.name : groupForm.name;
    const members = isEdit ? editingGroup.members : groupForm.selectedMembers;

    if (!name || members.length === 0) return;

    let updatedGroups;
    let nextActiveId = activeGroupId;

    const currentGroups = [...groupsStateRef.current];

    if (isEdit) {
      updatedGroups = currentGroups.map((g) =>
        g.id === editingGroup.id
          ? { ...g, name, members, avatar: editingGroup.avatar }
          : g,
      );
      setEditingGroup(null);
    } else {
      const gId = Date.now().toString();
      const g = {
        id: gId,
        name,
        members,
        avatar: groupForm.avatar,
        messages: [],
        lastActivity: Date.now(),
      };
      updatedGroups = [...currentGroups, g];
      nextActiveId = gId;
    }

    // Cloud-First: We update Firestore and wait. UI will auto-update via listener.
    await updateCloudState({
      groups: updatedGroups,
      activeGroupId: nextActiveId,
    });

    setGroupForm({ name: "", selectedMembers: [], avatar: null });
    setNewGroupModalOpen(false);
  };

  const clearChat = (id) => {
    const targetId = id || activeGroupId;
    const group = groupsStateRef.current.find((g) => g.id === targetId);

    setConfirmModal({
      open: true,
      title: "Clear Chat?",
      message: `This action will permanently delete all conversation history in ${group?.name || "this chat"}. This cannot be undone.`,
      type: "danger",
      onConfirm: async () => {
        const updatedGroups = groupsStateRef.current.map((g) =>
          g.id === targetId ? { ...g, messages: [] } : g,
        );
        await updateCloudState({ groups: updatedGroups });
      },
    });
  };

  const deleteChatById = (id) => {
    const group = groupsStateRef.current.find((g) => g.id === id);
    const isDM = group?.isDm;

    setConfirmModal({
      open: true,
      title: isDM ? "Delete Chat?" : "Delete Group?",
      message: isDM
        ? "Are you sure you want to delete this chat history? This cannot be undone."
        : "Are you sure you want to delete this group and its entire chat history? This cannot be undone.",
      type: "danger",
      onConfirm: async () => {
        const nextGroups = groupsStateRef.current.filter((gr) => gr.id !== id);
        const nextActiveId =
          activeGroupId === id && nextGroups.length > 0
            ? nextGroups[0].id
            : activeGroupId === id
              ? null
              : activeGroupId;

        await updateCloudState({
          groups: nextGroups,
          activeGroupId: nextActiveId,
        });
      },
    });
  };

  const handleEntityClick = async (persona) => {
    const dmGroupId = `dm_${persona.id}`;
    const existingGroup = groups.find((g) => g.id === dmGroupId);

    if (existingGroup) {
      setActiveGroupId(dmGroupId);
    } else {
      const newGroup = {
        id: dmGroupId,
        name: persona.name,
        members: [persona.id],
        messages: [],
        isDm: true,
        lastActivity: Date.now(),
      };

      await updateCloudState({
        groups: [...groupsStateRef.current, newGroup],
        activeGroupId: dmGroupId,
      });
    }
  };

  const handleProfilePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Profile photo must be under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const url = event.target.result;
      try {
        await updateCloudState({ userAvatar: url });
        setConfirmModal({
          open: true,
          title: "Identity Updated",
          message: "Your profile photo has been updated successfully.",
          type: "info",
          isAlert: true,
        });
      } catch (error) {
        console.error("Failed to update profile photo:", error);
        alert("Failed to update profile photo.");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDeleteProfilePhoto = () => {
    setConfirmModal({
      open: true,
      title: "Remove Photo?",
      message:
        "Your profile photo will be cleared and replaced with a default icon.",
      type: "warning",
      onConfirm: () => updateCloudState({ userAvatar: null }),
    });
  };

  const handleDeleteAccount = () => {
    setConfirmModal({
      open: true,
      title: "Wipe All Data?",
      message:
        "This will PERMANENTLY delete your username, all personas, all chats, and your API key. You will be logged out immediately.",
      type: "danger",
      onConfirm: () => {
        localStorage.clear();
        window.location.reload();
      },
    });
  };

  if (loading) {
    return (
      <div className={`flex h-screen items-center justify-center ${theme.bg}`}>
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          <p className={`${theme.subText} animate-pulse`}>
            Initializing Delo...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`flex h-screen items-center justify-center ${theme.bg} relative overflow-hidden`}
      >
        <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] animate-blob" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-indigo-600/10 rounded-full blur-[110px] animate-blob animation-delay-4000" />
        </div>

        <div className="w-full max-w-md p-8 glass-panel rounded-3xl flex flex-col items-center gap-8 border border-white/20 shadow-2xl animate-in fade-in zoom-in duration-500 bg-black/50 backdrop-blur-3xl">
          <div className="w-24 h-24 overflow-hidden flex items-center justify-center">
            <img
              src="assets/logo.png"
              alt="Delo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Delo Local
            </h1>
            <p className={`${theme.subText} text-sm`}>
              Enter your Gemini API Key to continue
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            className="w-full flex justify-center flex-col gap-4"
          >
            <input
              name="apiKey"
              type="password"
              placeholder="Gemini API Key"
              required
              className="w-full px-4 py-4 rounded-2xl bg-white/10 outline-none border border-white/10 placeholder-slate-500 text-white"
            />
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
  }

  return (
    <div
      className={`flex h-screen ${theme.bg} ${theme.text} font-sans overflow-hidden transition-all duration-1000 relative`}
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] animate-blob" />
        <div className="absolute top-[20%] right-[-5%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[100px] animate-blob animation-delay-2000" />
        <div className="absolute bottom-[-10%] left-[20%] w-[45%] h-[45%] bg-cyan-600/10 rounded-full blur-[110px] animate-blob animation-delay-4000" />
      </div>

      <aside
        className={`relative z-40 w-80 h-full ${theme.sidebar} flex flex-col shrink-0`}
      >
        <div
          className={`px-6 pt-[32px] pb-4 border-b ${theme.border} h-[100px] flex items-center shrink-0`}
          style={{ WebkitAppRegion: "drag", WebkitUserSelect: "none" }}
        >
          <div className="flex items-center gap-4 w-full">
            <div
              className={`w-14 h-14 overflow-hidden flex items-center justify-center shrink-0`}
            >
              <img
                src="assets/logo.png"
                alt="Delo Flow"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-sm whitespace-nowrap pr-4">
                Delo
              </h1>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Chats Section */}
          <div
            className={`flex flex-col min-h-0 transition-all duration-300 ${channelsExpanded ? "flex-1" : "h-auto"}`}
          >
            <div className="px-5 pt-4 pb-2 shrink-0">
              <div className="flex justify-between items-center">
                <button
                  onClick={() => setChannelsExpanded(!channelsExpanded)}
                  className={`flex items-center gap-1 text-[10px] font-bold ${theme.subText} uppercase tracking-widest hover:${theme.text} transition-colors outline-none`}
                >
                  <ChevronRight
                    size={14}
                    className={`transition-transform duration-300 ${channelsExpanded ? "rotate-90" : ""}`}
                  />
                  Chats
                </button>
                <div className="flex gap-3 items-center">
                  <button
                    onClick={() => {
                      setChannelSearchVisible(!channelSearchVisible);
                      if (channelSearchVisible) setChannelSearchQuery("");
                    }}
                    className={`${theme.subText} hover:${theme.text} transition-colors ${channelSearchVisible ? "text-blue-400" : ""}`}
                  >
                    <Search size={15} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingGroup(null);
                      setGroupForm({ name: "", selectedMembers: [] });
                      setNewGroupModalOpen(true);
                      setGroupPersonaSearchQuery("");
                    }}
                    className={`${theme.subText} hover:${theme.text}`}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`flex-1 overflow-y-auto custom-scrollbar px-3 space-y-1 ${!channelsExpanded ? "hidden" : ""}`}
            >
              {channelSearchVisible && (
                <div
                  className={`sticky top-0 z-10 px-2 py-2 mb-2 reveal-item ${theme.sidebar} bg-opacity-95 backdrop-blur-sm`}
                >
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400/50"
                      />
                      <input
                        type="text"
                        placeholder={
                          channelSearchMode === "name"
                            ? "Search groups..."
                            : "Search by persona type..."
                        }
                        value={channelSearchQuery}
                        onChange={(e) => setChannelSearchQuery(e.target.value)}
                        className={`w-full bg-white/5 border ${theme.border} text-xs rounded-xl py-2 pl-9 pr-3 outline-none focus:border-blue-500/50 transition-all text-slate-200 placeholder-slate-500`}
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={() =>
                        setChannelSearchMode(
                          channelSearchMode === "name" ? "role" : "name",
                        )
                      }
                      className={`px-3 rounded-xl border ${theme.border} bg-white/5 hover:bg-white/10 text-[9px] font-bold transition-all ${channelSearchMode === "role" ? "text-blue-400" : "text-slate-400"} uppercase tracking-tighter`}
                    >
                      {channelSearchMode === "name" ? "Name" : "Type"}
                    </button>
                  </div>
                </div>
              )}
              {groups
                .filter((g) => {
                  if (!channelSearchQuery) return true;
                  if (channelSearchMode === "name")
                    return g.name
                      .toLowerCase()
                      .includes(channelSearchQuery.toLowerCase());
                  return g.members.some((id) =>
                    getPersona(id)
                      ?.role.toLowerCase()
                      .includes(channelSearchQuery.toLowerCase()),
                  );
                })
                .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
                .map((g) => (
                  <div
                    key={g.id}
                    onClick={() => setActiveGroupId(g.id)}
                    className={`group flex items-center justify-between mx-2 p-2 rounded-xl cursor-pointer transition-all border ${activeGroupId === g.id ? theme.sidebarActive : `border-transparent hover:bg-white/5 ${theme.subText} hover:text-slate-200`}`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center border border-white/10">
                        {(
                          g.isDm ? getPersona(g.members[0])?.avatar : g.avatar
                        ) ? (
                          <img
                            src={
                              g.isDm
                                ? getPersona(g.members[0])?.avatar
                                : g.avatar
                            }
                            alt={g.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-blue-400">
                            {g.isDm ? <User size={16} /> : <Users size={16} />}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-semibold truncate">
                        {g.name}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setContextMenu({
                          visible: true,
                          x: rect.right + 8,
                          y: rect.top,
                          type: "channel",
                          target: g,
                        });
                      }}
                      className={`p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all ${theme.subText}`}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                ))}
            </div>
          </div>

          {/* Personas Section */}
          <div
            className={`flex flex-col min-h-0 border-t border-white/10 transition-all duration-300 ${entitiesExpanded ? "flex-1" : "h-auto"}`}
          >
            <div className="px-5 pt-4 pb-2 shrink-0">
              <div className="flex justify-between items-center">
                <button
                  onClick={() => setEntitiesExpanded(!entitiesExpanded)}
                  className={`flex items-center gap-1 text-[10px] font-bold ${theme.subText} uppercase tracking-widest hover:${theme.text} transition-colors outline-none`}
                >
                  <ChevronRight
                    size={14}
                    className={`transition-transform duration-300 ${entitiesExpanded ? "rotate-90" : ""}`}
                  />
                  Personas
                </button>
                <div className="flex gap-3 items-center">
                  <button
                    onClick={() => {
                      setEntitySearchVisible(!entitySearchVisible);
                      if (entitySearchVisible) setEntitySearchQuery("");
                    }}
                    className={`${theme.subText} hover:${theme.text} transition-colors ${entitySearchVisible ? "text-blue-400" : ""}`}
                  >
                    <Search size={15} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingPersona(null);
                      setNewPersona({ name: "", role: "", avatar: null });
                      setNewPersonaModalOpen(true);
                    }}
                    className={`${theme.subText} hover:${theme.text}`}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`flex-1 overflow-y-auto custom-scrollbar px-3 space-y-2 ${!entitiesExpanded ? "hidden" : ""}`}
            >
              {entitySearchVisible && (
                <div
                  className={`sticky top-0 z-10 px-2 py-2 mb-2 reveal-item ${theme.sidebar} bg-opacity-95 backdrop-blur-sm`}
                >
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400/50"
                      />
                      <input
                        type="text"
                        placeholder={
                          entitySearchMode === "name"
                            ? "Search personas..."
                            : "Search by persona type..."
                        }
                        value={entitySearchQuery}
                        onChange={(e) => setEntitySearchQuery(e.target.value)}
                        className={`w-full bg-white/5 border ${theme.border} text-xs rounded-xl py-2 pl-9 pr-3 outline-none focus:border-blue-500/50 transition-all text-slate-200 placeholder-slate-500`}
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={() =>
                        setEntitySearchMode(
                          entitySearchMode === "name" ? "role" : "name",
                        )
                      }
                      className={`px-3 rounded-xl border ${theme.border} bg-white/5 hover:bg-white/10 text-[9px] font-bold transition-all ${entitySearchMode === "role" ? "text-blue-400" : "text-slate-400"} uppercase tracking-tighter`}
                    >
                      {entitySearchMode === "name" ? "Name" : "Type"}
                    </button>
                  </div>
                </div>
              )}
              {personas
                .filter((p) => {
                  const query = entitySearchQuery.toLowerCase();
                  return entitySearchMode === "name"
                    ? p.name.toLowerCase().includes(query)
                    : p.role.toLowerCase().includes(query);
                })
                .map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleEntityClick(p)}
                    className={`group flex items-center justify-between mx-2 p-2 rounded-xl border ${theme.border} bg-white/5 cursor-pointer hover:bg-white/10 transition-colors`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center border border-white/10">
                        {p.avatar ? (
                          <img
                            src={p.avatar}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-blue-400">
                            <User size={16} />
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-bold truncate">
                        {p.name}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setContextMenu({
                          visible: true,
                          x: rect.right + 8,
                          y: rect.top,
                          type: "entity",
                          target: p,
                        });
                      }}
                      className={`p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all ${theme.subText}`}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div
          className={`p-4 ${theme.border} border-t bg-white/5 backdrop-blur-md shrink-0`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center">
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={16} />
                )}
              </div>
              <div className="text-sm font-bold truncate">
                {username || "Explorer"}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSettingsModalOpen(true)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Settings"
              >
                <Settings size={16} />
              </button>
              <button
                onClick={handleLogout}
                className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full relative">
        {currentGroup ? (
          <div
            key={currentGroup.id}
            className="flex-1 flex flex-col h-full animate-in fade-in duration-200"
          >
            <header
              className={`${theme.border} border-b px-6 pt-[35px] pb-4 flex items-center justify-between shadow-lg h-[108px] shrink-0`}
              style={{ WebkitAppRegion: "drag", WebkitUserSelect: "none" }}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-white/5 border border-white/10">
                  {(
                    currentGroup.isDm
                      ? getPersona(currentGroup.members[0])?.avatar
                      : currentGroup.avatar
                  ) ? (
                    <img
                      src={
                        currentGroup.isDm
                          ? getPersona(currentGroup.members[0])?.avatar
                          : currentGroup.avatar
                      }
                      alt={currentGroup.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-blue-400">
                      {currentGroup.isDm ? (
                        <User size={20} />
                      ) : (
                        <Users size={20} />
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <h2
                    className={`font-bold text-lg ${currentGroup.isDm ? "my-auto" : ""}`}
                  >
                    {currentGroup.name}
                  </h2>
                  {!currentGroup.isDm && (
                    <div
                      className={`text-[10px] ${theme.subText} flex items-center gap-1.5 mt-0.5 uppercase font-bold tracking-widest`}
                    >
                      <Users size={12} />
                      {currentGroup.members
                        .map((id) => getPersona(id)?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  style={{ WebkitAppRegion: "no-drag" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setContextMenu({
                      visible: true,
                      x: rect.right,
                      y: rect.bottom + 8,
                      type: "channel",
                      target: currentGroup,
                    });
                  }}
                  className={`p-2 rounded-lg ${theme.border} border hover:bg-white/5 transition-colors`}
                  title="Chat Options"
                >
                  <MoreVertical size={18} />
                </button>
              </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
              <div className="max-w-4xl mx-auto space-y-6">
                {currentGroup.messages.map((m) => {
                  const persona = getPersona(m.personaId);
                  const isUser = m.isUser;
                  return (
                    <div
                      key={m.id}
                      className={`group flex w-full ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`flex max-w-[80%] ${isUser ? "flex-row-reverse" : "flex-row"} items-start gap-3`}
                      >
                        <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 bg-white/5 shrink-0 flex items-center justify-center text-slate-400">
                          {isUser ? (
                            userAvatar ? (
                              <img
                                src={userAvatar}
                                alt="YOU"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User size={16} />
                            )
                          ) : persona?.avatar ? (
                            <img
                              src={persona.avatar}
                              alt={m.sender}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User size={16} />
                          )}
                        </div>
                        <div
                          className={`relative px-4 py-2 rounded-2xl ${isUser ? theme.userBubble : theme.botBubble}`}
                        >
                          <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">
                            {isUser ? "YOU" : m.sender}
                          </div>
                          <div className="text-sm">{m.text}</div>

                          {/* Hover Actions */}
                          <div
                            className={`absolute ${isUser ? "-left-16" : "-right-16"} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity`}
                          >
                            <button
                              onClick={() => copyToClipboard(m.text)}
                              className="p-1.5 rounded-full bg-black/50 hover:bg-blue-600 text-white"
                              title="Copy"
                            >
                              <Copy size={12} />
                            </button>
                            {isUser && (
                              <button
                                onClick={() => startEditMessage(m)}
                                className="p-1.5 rounded-full bg-black/50 hover:bg-cyan-600 text-white"
                                title="Edit"
                              >
                                <PenLine size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {processingPersonas
                  .filter((id) => currentGroup.members.includes(id))
                  .map((id) => {
                    const persona = getPersona(id);
                    if (!persona) return null;
                    return (
                      <div
                        key={`typing-${id}`}
                        className="group flex w-full justify-start animate-in slide-in-from-bottom-2 fade-in duration-300"
                      >
                        <div className="flex max-w-[80%] flex-row items-end gap-3">
                          <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 bg-white/5 shrink-0 flex items-center justify-center text-slate-400">
                            {persona.avatar ? (
                              <img
                                src={persona.avatar}
                                alt={persona.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User size={16} />
                            )}
                          </div>
                          <div
                            className={`relative px-4 py-3 rounded-2xl ${theme.botBubble} flex items-center justify-center gap-1.5 min-w-[50px] min-h-[38px]`}
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400/80 typing-dot"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400/80 typing-dot"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400/80 typing-dot"></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                <div ref={bottomRef} />
              </div>
            </main>

            <footer className="p-4 border-t border-white/10 relative">
              <div className="max-w-4xl mx-auto flex flex-col gap-2">
                {editingMessage && (
                  <div className="flex justify-between items-center text-[10px] bg-cyan-900/20 text-cyan-400 px-3 py-1.5 rounded-lg border border-cyan-900/50 uppercase font-black tracking-widest">
                    <span>Editing message...</span>
                    <button
                      onClick={() => {
                        setEditingMessage(null);
                        setInputMessage("");
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <form
                  onSubmit={handleSendMessage}
                  className="flex gap-3 relative items-end"
                >
                  <div className="relative" ref={plusMenuRef}>
                    <button
                      type="button"
                      onClick={() => setPlusMenuOpen(!plusMenuOpen)}
                      className={`h-[52px] w-[52px] flex items-center justify-center rounded-full transition-all bg-white/5 backdrop-blur-xl hover:bg-white/10 text-white active:scale-95 shadow-lg shadow-black/20`}
                    >
                      <Plus
                        size={24}
                        className={`transition-transform duration-300 ${plusMenuOpen ? "rotate-45" : ""}`}
                      />
                    </button>

                    {plusMenuOpen && (
                      <div
                        className={`absolute bottom-[64px] left-0 ${theme.modal} p-3 rounded-2xl shadow-2xl z-50 flex flex-col gap-1 min-w-[160px] animate-in slide-in-from-bottom-2 duration-200`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setPollModalOpen(true);
                            setPlusMenuOpen(false);
                          }}
                          className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-widest"
                        >
                          <BarChart2 size={16} className="text-yellow-500" />{" "}
                          Poll
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            imageInputRef.current?.click();
                            setPlusMenuOpen(false);
                          }}
                          className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-widest"
                        >
                          <ImageIcon size={16} className="text-pink-500" />{" "}
                          Photos
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            fileInputRef.current?.click();
                            setPlusMenuOpen(false);
                          }}
                          className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-widest"
                        >
                          <FileText size={16} className="text-indigo-500" />{" "}
                          File
                        </button>
                      </div>
                    )}
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={imageInputRef}
                    onChange={(e) => handleFileUpload(e, "image")}
                  />
                  <input
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => handleFileUpload(e, "file")}
                  />

                  <textarea
                    ref={inputRef}
                    value={inputMessage}
                    onChange={(e) => {
                      setInputMessage(e.target.value);
                      delayAIResponseIfPending();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    placeholder={`Message ${currentGroup.name}...`}
                    className={`flex-1 ${theme.input} rounded-xl px-4 py-3 h-[52px] outline-none resize-none leading-relaxed text-sm`}
                  />
                  <button
                    type="submit"
                    disabled={
                      !inputMessage.trim() || processingPersonas.length > 0
                    }
                    className={`w-[52px] h-[52px] rounded-xl flex items-center justify-center shrink-0 ${theme.button} disabled:opacity-50`}
                  >
                    <Send size={20} />
                  </button>
                </form>
              </div>
            </footer>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center relative">
            <div
              className={`absolute top-0 left-0 w-full h-[108px] border-b ${theme.border}`}
              style={{ WebkitAppRegion: "drag" }}
            />
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 mb-8 mt-[108px]">
              Select a channel to begin
            </h1>
            <button
              onClick={() => setNewGroupModalOpen(true)}
              className={`${theme.button} px-8 py-3 rounded-xl font-bold flex items-center gap-2`}
            >
              <Plus size={18} /> CREATE CHANNEL
            </button>
          </div>
        )}
      </div>

      {newPersonaModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`${theme.modal} p-6 rounded-2xl w-full max-w-md`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">
                {editingPersona ? "Edit Persona" : "New Persona"}
              </h2>
              <button onClick={() => setNewPersonaModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-4 mb-2">
                <div className="relative group/avatar w-24 h-24 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shadow-xl">
                  {(
                    editingPersona ? editingPersona.avatar : newPersona.avatar
                  ) ? (
                    <img
                      src={
                        editingPersona
                          ? editingPersona.avatar
                          : newPersona.avatar
                      }
                      className="w-full h-full object-cover"
                      onClick={() =>
                        window.open(
                          editingPersona
                            ? editingPersona.avatar
                            : newPersona.avatar,
                          "_blank",
                        )
                      }
                      title="Click to view full image"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 bg-white/5">
                      <User size={40} />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => personaImageInputRef.current?.click()}
                      className="p-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-all scale-90 group-hover/avatar:scale-100"
                      title="Change Photo"
                    >
                      <Camera size={16} />
                    </button>
                    {(editingPersona
                      ? editingPersona.avatar
                      : newPersona.avatar) && (
                      <button
                        onClick={() =>
                          editingPersona
                            ? setEditingPersona({
                                ...editingPersona,
                                avatar: null,
                              })
                            : setNewPersona({ ...newPersona, avatar: null })
                        }
                        className="p-2 rounded-full bg-red-600 hover:bg-red-500 text-white transition-all scale-90 group-hover/avatar:scale-100"
                        title="Remove Photo"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="file"
                  ref={personaImageInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handlePersonaPhotoUpload}
                />
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  Profile Picture
                </p>
              </div>

              <input
                ref={personaNameRef}
                placeholder="Persona Name"
                className={`w-full p-3 rounded-xl ${theme.input} outline-none font-bold`}
                value={editingPersona ? editingPersona.name : newPersona.name}
                onChange={(e) =>
                  editingPersona
                    ? setEditingPersona({
                        ...editingPersona,
                        name: e.target.value,
                      })
                    : setNewPersona({ ...newPersona, name: e.target.value })
                }
              />
              <textarea
                placeholder="Persona Instructions & Personality..."
                className={`w-full p-3 rounded-xl ${theme.input} outline-none h-32 text-sm leading-relaxed`}
                value={editingPersona ? editingPersona.role : newPersona.role}
                onChange={(e) =>
                  editingPersona
                    ? setEditingPersona({
                        ...editingPersona,
                        role: e.target.value,
                      })
                    : setNewPersona({ ...newPersona, role: e.target.value })
                }
              />
              <button
                onClick={handleSavePersona}
                className={`w-full py-3 rounded-xl font-bold ${theme.button} mt-4`}
              >
                {editingPersona ? "UPDATE PERSONA" : "CREATE PERSONA"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pollModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`${theme.modal} p-6 rounded-2xl w-full max-w-md`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Create Poll</h2>
              <button onClick={() => setPollModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <input
                placeholder="The Question"
                className={`w-full p-3 rounded-xl ${theme.input} outline-none`}
                value={newPoll.question}
                onChange={(e) =>
                  setNewPoll({ ...newPoll, question: e.target.value })
                }
              />
              {newPoll.options.map((opt, idx) => (
                <input
                  key={idx}
                  placeholder={`Option ${idx + 1}`}
                  className={`w-full p-3 rounded-xl ${theme.input} outline-none`}
                  value={opt}
                  onChange={(e) => {
                    const next = [...newPoll.options];
                    next[idx] = e.target.value;
                    setNewPoll({ ...newPoll, options: next });
                  }}
                />
              ))}
              <button
                onClick={() =>
                  setNewPoll({ ...newPoll, options: [...newPoll.options, ""] })
                }
                className="text-cyan-400 text-xs font-bold uppercase tracking-widest hover:text-cyan-300 transition-colors"
              >
                + Add Option
              </button>
              <button
                onClick={handlePollSubmit}
                className={`w-full py-3 rounded-xl font-bold ${theme.button} mt-4`}
              >
                SEND POLL
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`${theme.modal} p-6 rounded-2xl w-full max-w-md`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Upload File</h2>
              <button onClick={() => setUploadModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              {pendingUpload?.type === "image" && (
                <div className="aspect-video w-full rounded-xl overflow-hidden border border-white/10">
                  <img
                    src={pendingUpload.url}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center gap-4">
                <FileText className="text-indigo-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">
                    {pendingUpload?.name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold">
                    {(pendingUpload?.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
              <input
                placeholder="Description/Caption (Optional)"
                className={`w-full p-3 rounded-xl ${theme.input} outline-none`}
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
              />
              <button
                onClick={handleConfirmUpload}
                className={`w-full py-3 rounded-xl font-bold ${theme.button} mt-4`}
              >
                SEND
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal JSX removed - handled by unified system */}

      {newGroupModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`${theme.modal} p-6 rounded-2xl w-full max-w-md`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">
                {editingGroup ? "Edit Group" : "New Group"}
              </h2>
              <button
                onClick={() => {
                  setNewGroupModalOpen(false);
                  setGroupPersonaSearchQuery("");
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Channel Avatar Configuration */}
              <div className="flex flex-col items-center gap-4 mb-2">
                <div className="relative group/avatar w-24 h-24 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shadow-xl">
                  {(editingGroup ? editingGroup.avatar : groupForm.avatar) ? (
                    <img
                      src={
                        editingGroup ? editingGroup.avatar : groupForm.avatar
                      }
                      className="w-full h-full object-cover"
                      onClick={() =>
                        window.open(
                          editingGroup ? editingGroup.avatar : groupForm.avatar,
                          "_blank",
                        )
                      }
                      title="Click to view full image"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 bg-white/5">
                      <Users size={40} />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => channelImageInputRef.current?.click()}
                      className="p-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-all scale-90 group-hover/avatar:scale-100"
                      title="Change Photo"
                    >
                      <Camera size={16} />
                    </button>
                    {(editingGroup
                      ? editingGroup.avatar
                      : groupForm.avatar) && (
                      <button
                        onClick={() =>
                          editingGroup
                            ? setEditingGroup({ ...editingGroup, avatar: null })
                            : setGroupForm({ ...groupForm, avatar: null })
                        }
                        className="p-2 rounded-full bg-red-600 hover:bg-red-500 text-white transition-all scale-90 group-hover/avatar:scale-100"
                        title="Remove Photo"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="file"
                  ref={channelImageInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleChannelPhotoUpload}
                />
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  Group Icon
                </p>
              </div>

              <input
                ref={groupNameRef}
                placeholder="Group Name"
                className={`w-full p-3 rounded-xl ${theme.input} outline-none font-bold`}
                value={editingGroup ? editingGroup.name : groupForm.name}
                onChange={(e) =>
                  editingGroup
                    ? setEditingGroup({ ...editingGroup, name: e.target.value })
                    : setGroupForm({ ...groupForm, name: e.target.value })
                }
              />

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="text"
                    placeholder={
                      groupPersonaSearchMode === "name"
                        ? "Search personas..."
                        : "Search by persona type..."
                    }
                    className={`w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-9 pr-3 outline-none focus:border-blue-500/50 transition-all text-sm text-slate-200 placeholder-slate-500`}
                    value={groupPersonaSearchQuery}
                    onChange={(e) => setGroupPersonaSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  onClick={() =>
                    setGroupPersonaSearchMode(
                      groupPersonaSearchMode === "name" ? "role" : "name",
                    )
                  }
                  className={`px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-bold transition-all ${groupPersonaSearchMode === "role" ? "text-blue-400" : "text-slate-400"} uppercase tracking-tighter`}
                >
                  {groupPersonaSearchMode === "name" ? "Name" : "Type"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1 mt-2">
                {personas
                  .filter((p) => {
                    const isSelected = (
                      editingGroup
                        ? editingGroup.members
                        : groupForm.selectedMembers
                    ).includes(p.id);

                    if (!groupPersonaSearchQuery) return isSelected;

                    const query = groupPersonaSearchQuery.toLowerCase();
                    return groupPersonaSearchMode === "name"
                      ? p.name.toLowerCase().includes(query)
                      : p.role.toLowerCase().includes(query);
                  })
                  .map((p) => {
                    const isSelected = (
                      editingGroup
                        ? editingGroup.members
                        : groupForm.selectedMembers
                    ).includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          const currentMembers = editingGroup
                            ? editingGroup.members
                            : groupForm.selectedMembers;
                          const members = isSelected
                            ? currentMembers.filter((id) => id !== p.id)
                            : [...currentMembers, p.id];
                          if (editingGroup) {
                            setEditingGroup({ ...editingGroup, members });
                          } else {
                            setGroupForm({
                              ...groupForm,
                              selectedMembers: members,
                            });
                          }
                        }}
                        className={`p-2 rounded-lg border flex items-center gap-2 text-xs font-bold transition-all ${isSelected ? "bg-blue-600 border-blue-400" : "bg-white/5 border-white/10"}`}
                      >
                        <div className="w-6 h-6 rounded-md overflow-hidden bg-white/10 shrink-0">
                          {p.avatar && (
                            <img
                              src={p.avatar}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        {p.name}
                      </button>
                    );
                  })}
              </div>
              <button
                onClick={handleSaveGroup}
                className={`w-full py-3 rounded-xl font-bold ${theme.button} mt-4`}
              >
                {editingGroup ? "UPDATE GROUP" : "CREATE GROUP"}
              </button>
            </div>
          </div>
        </div>
      )}
      {settingsModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`${theme.modal} p-6 rounded-2xl w-full max-w-md`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Settings</h2>
              <button onClick={() => setSettingsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Profile Photo Section */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative group/avatar w-24 h-24 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shadow-xl">
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt={username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 bg-white/5">
                      <User size={40} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => profileImageInputRef.current?.click()}
                      className="p-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-all scale-90 group-hover/avatar:scale-100"
                      title="Change Photo"
                    >
                      <Camera size={16} />
                    </button>
                    {userAvatar && (
                      <button
                        onClick={handleDeleteProfilePhoto}
                        className="p-2 rounded-full bg-red-600 hover:bg-red-500 text-white transition-all scale-90 group-hover/avatar:scale-100"
                        title="Remove Photo"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="file"
                  ref={profileImageInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleProfilePhotoUpload}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500/50 transition-all text-white placeholder-slate-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey || ""}
                    onChange={(e) => {
                      const newKey = e.target.value;
                      setApiKey(newKey);
                      if (newKey) localStorage.setItem("delo_api_key", newKey);
                    }}
                    placeholder="Enter your new Gemini API Key"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500/50 transition-all text-white placeholder-slate-500"
                  />
                </div>
              </div>

              {/* Danger Zone */}
              <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
                <button
                  onClick={() => {
                    updateCloudState({ username });
                    setSettingsModalOpen(false);
                  }}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all active:scale-95"
                >
                  SAVE CONFIGURATION
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="w-full py-3 rounded-xl border border-red-900/30 bg-red-900/10 text-red-500 text-xs font-bold uppercase tracking-widest hover:bg-red-900/20 transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={14} /> DELETE ACCOUNT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Context Menu Dropdown */}
      {contextMenu.visible && (
        <div
          className={`fixed z-[100] ${theme.modal} border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] py-2 min-w-[200px] animate-in zoom-in-95 duration-150`}
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
            transform:
              contextMenu.x > window.innerWidth - 220
                ? "translateX(-100%)"
                : "none",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "channel" && (
            <>
              {!contextMenu.target?.isDm && (
                <button
                  onClick={() => {
                    setEditingGroup(contextMenu.target);
                    setNewGroupModalOpen(true);
                    setGroupPersonaSearchQuery("");
                    setContextMenu({ ...contextMenu, visible: false });
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-slate-200"
                >
                  <Settings size={16} className="text-slate-400" /> Edit
                  Settings
                </button>
              )}
              <button
                onClick={() => {
                  clearChat();
                  setContextMenu({ ...contextMenu, visible: false });
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-amber-400"
              >
                <RefreshCw size={16} /> Clear Chat
              </button>
              <div className="h-px bg-white/10 my-1.5" />
              <button
                onClick={() => {
                  deleteChatById(contextMenu.target.id);
                  setContextMenu({ ...contextMenu, visible: false });
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold hover:bg-red-500/10 text-red-500 transition-colors uppercase tracking-widest"
              >
                <Trash2 size={16} />{" "}
                {contextMenu.target?.isDm ? "Delete Chat" : "Delete Group"}
              </button>
            </>
          )}
          {contextMenu.type === "entity" && (
            <>
              <button
                onClick={() => {
                  handleEntityClick(contextMenu.target);
                  setContextMenu({ ...contextMenu, visible: false });
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-cyan-400"
              >
                <MessageSquare size={16} /> Send Message
              </button>
              <button
                onClick={() => {
                  setEditingPersona(contextMenu.target);
                  setNewPersonaModalOpen(true);
                  setContextMenu({ ...contextMenu, visible: false });
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-slate-200"
              >
                <PenLine size={16} className="text-slate-400" /> Edit Persona
              </button>
              <div className="h-px bg-white/10 my-1.5" />
              <button
                onClick={() => {
                  deletePersona(contextMenu.target.id);
                  setContextMenu({ ...contextMenu, visible: false });
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold hover:bg-red-500/10 text-red-500 transition-colors uppercase tracking-widest"
              >
                <Trash2 size={16} /> Delete Persona
              </button>
            </>
          )}
        </div>
      )}
      {/* Custom Confirmation Modal */}
      {confirmModal.open && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <div
            className={`${theme.modal} p-8 rounded-3xl w-full max-w-sm text-center border border-white/5 shadow-2xl animate-in fade-in zoom-in-95 duration-200`}
          >
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${
                confirmModal.type === "danger"
                  ? "bg-red-500/10 text-red-500"
                  : "bg-amber-500/10 text-amber-500"
              }`}
            >
              <Trash2 size={32} />
            </div>
            <h2 className="text-2xl font-black mb-2">{confirmModal.title}</h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-8 px-2">
              {confirmModal.message}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  confirmModal.onConfirm?.();
                  setConfirmModal({ ...confirmModal, open: false });
                }}
                className={`w-full py-4 rounded-2xl text-white font-bold transition-all active:scale-95 shadow-lg ${
                  confirmModal.type === "danger"
                    ? "bg-red-600 hover:bg-red-500 shadow-red-900/20"
                    : "bg-amber-600 hover:bg-amber-500 shadow-amber-900/20"
                }`}
              >
                CONFIRM
              </button>
              {!confirmModal.isAlert && (
                <button
                  onClick={() =>
                    setConfirmModal({ ...confirmModal, open: false })
                  }
                  className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all border border-white/5"
                >
                  CANCEL
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
