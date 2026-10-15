
import { useEffect, useRef, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";

const LANGUAGES = {
  English: { recognition: "en-IN", speech: "en-IN" },
  Telugu: { recognition: "te-IN", speech: "te-IN" },
  Hindi: { recognition: "hi-IN", speech: "hi-IN" },
};

export default function App() {
  const [tab, setTab] = useState("assistant");
  const [language, setLanguage] = useState("Telugu");
  const [health, setHealth] = useState("Checking...");
  const [categories, setCategories] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [category, setCategory] = useState("All");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "నమస్కారం! నేను GovAssist. ప్రభుత్వ పథకాల గురించి అడగండి.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [file, setFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");

  const recognitionRef = useRef(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    checkHealth();
    loadSchemes();

    return () => {
      mountedRef.current = false;
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  async function checkHealth() {
    try {
      const response = await fetch(`${API}/api/health`);
      if (!response.ok) throw new Error("Backend unavailable");

      const data = await response.json();
      if (mountedRef.current) {
        setHealth(data.status === "ok" ? "Connected" : "Unavailable");
      }
    } catch {
      if (mountedRef.current) setHealth("Offline");
    }
  }

  async function loadSchemes() {
    try {
      const [categoryResponse, schemeResponse] = await Promise.all([
        fetch(`${API}/api/categories`),
        fetch(`${API}/api/schemes`),
      ]);

      if (!categoryResponse.ok || !schemeResponse.ok) {
        throw new Error("Unable to load schemes");
      }

      const categoryData = await categoryResponse.json();
      const schemeData = await schemeResponse.json();

      if (mountedRef.current) {
        setCategories(categoryData.categories || []);
        setSchemes(schemeData.schemes || []);
      }
    } catch (error) {
      console.error(error);
    }
  }

  function speakAnswer(text, selectedLanguage = language) {
    if (!("speechSynthesis" in window)) {
      setVoiceError("Speech output is not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANGUAGES[selectedLanguage].speech;
    utterance.rate = 0.92;
    utterance.pitch = 1;

    const availableVoices = window.speechSynthesis.getVoices();
    const languagePrefix =
      LANGUAGES[selectedLanguage].speech.split("-")[0].toLowerCase();

    const matchingVoice = availableVoices.find(
      (voice) => voice.lang.toLowerCase() ===
        LANGUAGES[selectedLanguage].speech.toLowerCase()
    ) || availableVoices.find(
      (voice) => voice.lang.toLowerCase().startsWith(languagePrefix)
    );

    if (matchingVoice) utterance.voice = matchingVoice;

    utterance.onstart = () => {
      if (mountedRef.current) setSpeaking(true);
    };

    utterance.onend = () => {
      if (mountedRef.current) setSpeaking(false);
    };

    utterance.onerror = () => {
      if (mountedRef.current) setSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  async function askQuestion(text, selectedLanguage = language) {
    const cleanText = text.trim();
    if (!cleanText || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setVoiceError("");

    setMessages((previous) => [
      ...previous,
      { role: "user", text: cleanText },
    ]);
    setQuestion("");

    try {
      const response = await fetch(`${API}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: cleanText,
          language: selectedLanguage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Request failed");
      }

      const answer = data.answer || "No answer was returned.";

      if (mountedRef.current) {
        setMessages((previous) => [
          ...previous,
          { role: "assistant", text: answer },
        ]);

        // Speak the response in the selected language.
        speakAnswer(answer, selectedLanguage);
      }
    } catch (error) {
      const errorMessage =
        "Backend ki connect avvalekapoyanu. Backend server running lo undo check cheyyandi. " +
        error.message;

      if (mountedRef.current) {
        setMessages((previous) => [
          ...previous,
          { role: "assistant", text: errorMessage },
        ]);
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  function sendQuestion(event) {
    event.preventDefault();
    askQuestion(question);
  }

  function startListening() {
    setVoiceError("");

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError(
        "Voice input ee browser lo support avvakapovachu. Latest Chrome lo try cheyyandi, leda text type cheyyandi."
      );
      return;
    }

    if (busyRef.current) {
      setVoiceError("Previous answer complete ayyaka try cheyyandi.");
      return;
    }

    // Stop previous recognition instance if one exists.
    recognitionRef.current?.stop();

    const recognition = new SpeechRecognition();
    recognition.lang = LANGUAGES[language].recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    recognition.onstart = () => {
      setListening(true);
      setVoiceError("");
    };

    recognition.onresult = (event) => {
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      setQuestion(finalTranscript || interimTranscript);
    };

    recognition.onerror = (event) => {
      setListening(false);

      if (event.error === "not-allowed") {
        setVoiceError(
          "Microphone permission allow cheyyandi. Browser address bar daggara microphone setting check cheyyandi."
        );
      } else if (event.error === "no-speech") {
        setVoiceError("Voice vinapadaledu. Malli microphone click chesi maatladandi.");
      } else if (event.error !== "aborted") {
        setVoiceError(`Voice recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;

      const spokenText = finalTranscript.trim();

      if (spokenText) {
        setQuestion(spokenText);
        askQuestion(spokenText, language);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setListening(false);
      setVoiceError("Microphone start avvaledu. Malli try cheyyandi.");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function uploadDocument(event) {
    event.preventDefault();

    if (!file) {
      setUploadMessage("Please choose a PDF first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setBusy(true);
    setUploadMessage("");

    try {
      const response = await fetch(`${API}/api/upload-pdf`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      setUploadMessage(
        `${data.message} ${data.note || ""}`
      );
      setFile(null);
      event.target.reset();
    } catch (error) {
      setUploadMessage(`Upload failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  const visibleSchemes =
    category === "All"
      ? schemes
      : schemes.filter((scheme) => scheme.category === category);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setTab("assistant");
          }}
        >
          <span className="brand-mark">G</span>
          <span>
            <strong>GovAssist</strong>
            <small>Voice-powered Government Assistant</small>
          </span>
        </a>

        <div className="connection">
          <span
            className={`status-dot ${
              health === "Connected" ? "online" : ""
            }`}
          />
          API: {health}
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">YOUR GOVERNMENT SERVICES GUIDE</span>
            <h1>
              Government schemes,
              <br />
              <span>made easier.</span>
            </h1>
            <p>
              Speak in Telugu, English or Hindi to explore scheme
              information and official application websites.
            </p>
            <button
              className="primary-button"
              onClick={() => setTab("assistant")}
            >
              Talk to GovAssist <span>→</span>
            </button>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="art-sun" />
            <div className="art-building">
              <div className="building-roof" />
              <div className="building-top">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="building-base" />
              <div className="building-steps" />
            </div>
            <div className="art-card">
              <span>✓</span>
              <div>
                <strong>Information for everyone</strong>
                <small>Speak · Ask · Listen</small>
              </div>
            </div>
          </div>
        </section>

        <nav className="tabs" aria-label="Main navigation">
          <button
            className={tab === "assistant" ? "active" : ""}
            onClick={() => setTab("assistant")}
          >
            <span>🎙</span> Voice Assistant
          </button>
          <button
            className={tab === "schemes" ? "active" : ""}
            onClick={() => setTab("schemes")}
          >
            <span>▦</span> Explore Schemes
          </button>
          <button
            className={tab === "documents" ? "active" : ""}
            onClick={() => setTab("documents")}
          >
            <span>⇧</span> PDF Upload
          </button>
        </nav>

        {tab === "assistant" && (
          <section className="content-panel assistant-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">VOICE + TEXT</span>
                <h2>Talk to GovAssist</h2>
                <p>Ask your question. GovAssist will answer and speak back.</p>
              </div>
              <span className="assistant-icon">🎙</span>
            </div>

            <div className="voice-controls">
              <label htmlFor="voice-language">Choose your language</label>
              <select
                id="voice-language"
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value);
                  setVoiceError("");
                }}
                disabled={listening || busy}
              >
                <option value="Telugu">తెలుగు (Telugu)</option>
                <option value="English">English</option>
                <option value="Hindi">हिन्दी (Hindi)</option>
              </select>

              <button
                className={`mic-button ${listening ? "is-listening" : ""}`}
                onClick={listening ? stopListening : startListening}
                disabled={busy}
                aria-label={listening ? "Stop listening" : "Start voice input"}
              >
                <span>{listening ? "■" : "🎙"}</span>
              </button>

              <strong className="voice-status">
                {listening
                  ? "Listening… maatladandi"
                  : speaking
                    ? "Speaking…"
                    : busy
                      ? "Preparing answer…"
                      : "Microphone click chesi maatladandi"}
              </strong>

              {speaking && (
                <button className="secondary-button" onClick={stopSpeaking}>
                  Stop voice
                </button>
              )}

              {voiceError && (
                <p className="voice-error" role="alert">{voiceError}</p>
              )}
            </div>

            <div className="chat-box">
              <div className="messages">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`message ${message.role}`}
                  >
                    <div className="message-avatar">
                      {message.role === "assistant" ? "G" : "Y"}
                    </div>
                    <div className="message-text">{message.text}</div>
                  </div>
                ))}

                {busy && (
                  <div className="typing">GovAssist is preparing an answer…</div>
                )}
              </div>

              <form className="chat-form" onSubmit={sendQuestion}>
                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Type your question or use the microphone"
                  aria-label="Ask a government scheme question"
                  disabled={busy}
                />
                <button
                  className="primary-button send-button"
                  disabled={busy || !question.trim()}
                >
                  {busy ? "Wait..." : "Send ↑"}
                </button>
              </form>

              <p className="disclaimer">
                Voice recognition may use your browser's online speech
                service. Check important eligibility details on official
                government websites.
              </p>
            </div>
          </section>
        )}

        {tab === "schemes" && (
          <section className="content-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">FIND WHAT YOU NEED</span>
                <h2>Explore government schemes</h2>
                <p>Browse the starter catalogue by category.</p>
              </div>
            </div>

            <div className="filter-row">
              <label htmlFor="category">Filter by category</label>
              <select
                id="category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option>All</option>
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div className="scheme-grid">
              {visibleSchemes.map((scheme) => (
                <article className="scheme-card" key={scheme.id}>
                  <span className="scheme-category">{scheme.category}</span>
                  <h3>{scheme.name}</h3>
                  <p>{scheme.description}</p>
                  <div className="eligibility">
                    <strong>Eligibility</strong>
                    <span>{scheme.eligibility}</span>
                  </div>
                  <a
                    className="official-link"
                    href={scheme.official_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Visit official website ↗
                  </a>
                </article>
              ))}
            </div>

            <p className="disclaimer">
              This is a starter catalogue, not a complete government database.
              Check current information on each official website.
            </p>
          </section>
        )}

        {tab === "documents" && (
          <section className="content-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">DOCUMENT TOOLS</span>
                <h2>Upload a PDF document</h2>
                <p>Save a scheme PDF on the backend.</p>
              </div>
              <span className="assistant-icon">⇧</span>
            </div>

            <form className="upload-box" onSubmit={uploadDocument}>
              <div className="upload-symbol">↑</div>
              <h3>Choose your PDF</h3>
              <p>PDF files only</p>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) =>
                  setFile(event.target.files?.[0] || null)
                }
              />
              {file && <p className="selected-file">{file.name}</p>}
              <button className="primary-button" disabled={busy}>
                {busy ? "Uploading..." : "Upload PDF"}
              </button>
              {uploadMessage && (
                <p className="upload-message">{uploadMessage}</p>
              )}
            </form>

            <p className="disclaimer">
              PDF upload saves the file only. PDF text extraction and
              document-based question answering are not enabled yet.
              Avoid uploading sensitive personal documents.
            </p>
          </section>
        )}
      </main>

      <footer className="footer">
        <strong>GovAssist</strong>
        <span>Information support for public services.</span>
        <span>Confirm scheme details on official portals.</span>
      </footer>
    </div>
  );
}
