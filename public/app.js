const authGate = document.getElementById("auth-gate");
const chatApp = document.getElementById("chat-app");
const authError = document.getElementById("auth-error");
const logoutBtn = document.getElementById("logout-btn");

const promptInput = document.getElementById("prompt-input");
const sendBtn = document.getElementById("send-btn");
const chatWindow = document.getElementById("chat-window");

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const loginEmail = document.getElementById("login-email");
const loginPass = document.getElementById("login-password");
const loginBtn = document.getElementById("login-btn");

const regName = document.getElementById("reg-name");
const regEmail = document.getElementById("reg-email");
const regPass = document.getElementById("reg-password");
const regBtn = document.getElementById("register-btn");

const showRegister = document.getElementById("show-register");
const showLogin = document.getElementById("show-login");

// --- Auth Logic ---

// We store the session userId in local storage
let sessionUserId = localStorage.getItem("gravity_userId");

if (sessionUserId) {
    authGate.classList.remove("active");
    chatApp.classList.add("active");
    promptInput.focus();
}

showRegister.addEventListener("click", () => {
    loginForm.style.display = "none";
    registerForm.style.display = "block";
    authError.innerText = "";
});

showLogin.addEventListener("click", () => {
    registerForm.style.display = "none";
    loginForm.style.display = "block";
    authError.innerText = "";
});

loginBtn.addEventListener("click", attemptLogin);
regBtn.addEventListener("click", attemptRegister);

async function attemptLogin() {
    const email = loginEmail.value.trim();
    const password = loginPass.value;
    if (!email || !password) {
        authError.innerText = "Email and password required.";
        return;
    }

    loginBtn.disabled = true;
    authError.innerText = "Authenticating...";

    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok) {
            sessionUserId = data.userId;
            localStorage.setItem("gravity_userId", data.userId);
            authGate.classList.remove("active");
            chatApp.classList.add("active");
            promptInput.focus();
        } else {
            authError.innerText = data.error || "Login failed.";
        }
    } catch (e) {
        authError.innerText = "Connection error.";
    } finally {
        loginBtn.disabled = false;
    }
}

async function attemptRegister() {
    const name = regName.value.trim();
    const email = regEmail.value.trim();
    const password = regPass.value;

    if (!name || !email || !password) {
        authError.innerText = "All fields are required.";
        return;
    }

    regBtn.disabled = true;
    authError.innerText = "Creating account...";

    try {
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();

        if (res.ok) {
            sessionUserId = data.userId;
            localStorage.setItem("gravity_userId", data.userId);
            authGate.classList.remove("active");
            chatApp.classList.add("active");
            promptInput.focus();
        } else {
            authError.innerText = data.error || "Registration failed.";
        }
    } catch (e) {
        authError.innerText = "Connection error.";
    } finally {
        regBtn.disabled = false;
    }
}

logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("gravity_userId");
    window.location.reload();
});


// --- Chat Logic ---

promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener("click", sendMessage);

async function sendMessage() {
    const text = promptInput.value.trim();
    if (!text) return;

    if (!sessionUserId) {
        authError.innerText = "Please sign in to continue.";
        return;
    }

    // 1. Render User Message
    appendMessage("user", text);
    promptInput.value = "";
    promptInput.style.height = "auto";
    sendBtn.disabled = true;

    // 2. Create a bot message placeholder that we'll stream into
    const botMsgId = appendMessage("bot", "", false, true);

    try {
        // 3. Open SSE stream to /api/chat
        const response = await fetch('/api/chat', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                userId: sessionUserId
            })
        });

        if (response.status === 401) {
            // Kick them out!
            localStorage.removeItem('gravity_userId');
            sessionUserId = null;
            authGate.classList.add("active");
            chatApp.classList.remove("active");
            authError.innerText = "Session expired or unauthorized.";
            removeMessage(botMsgId);
            sendBtn.disabled = false;
            return;
        }

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        // 4. Read the SSE stream chunk by chunk
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Keep incomplete line in buffer

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const jsonStr = line.slice(6).trim();
                if (!jsonStr) continue;

                try {
                    const event = JSON.parse(jsonStr);

                    if (event.type === "token") {
                        fullText += event.text;
                        // Update the message with parsed markdown
                        updateMessageStreaming(botMsgId, fullText);
                    } else if (event.type === "status") {
                        // Show tool-use status briefly
                        updateMessageStreaming(botMsgId, `_${event.text}_`, true);
                    } else if (event.type === "error") {
                        updateMessageStreaming(botMsgId, `⚠️ Error: ${event.text}`, true);
                    } else if (event.type === "done") {
                        // Final render with full markdown
                        if (fullText) updateMessageStreaming(botMsgId, fullText);
                    }
                } catch (_) { /* ignore parse errors */ }
            }
        }

    } catch (err) {
        console.error(err);
        updateMessageStreaming(botMsgId, `⚠️ Connection Error: ${err.message}`, true);
    } finally {
        sendBtn.disabled = false;
        promptInput.focus();
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
}

function appendMessage(role, content, isHtml = false, isStreaming = false) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role}-msg`;
    const id = "msg-" + Date.now() + Math.random();
    msgDiv.id = id;

    const innerDiv = document.createElement("div");
    innerDiv.className = "msg-content";

    if (isStreaming) {
        innerDiv.innerHTML = '<span class="loading-dots">...</span>';
    } else if (isHtml) {
        innerDiv.innerHTML = content;
    } else if (role === "bot" && content) {
        innerDiv.innerHTML = marked.parse(content);
    } else {
        innerDiv.textContent = content;
    }

    msgDiv.appendChild(innerDiv);
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    return id;
}

function updateMessageStreaming(id, text, forceMarkdown = false) {
    const el = document.getElementById(id);
    if (!el) return;
    const contentDiv = el.querySelector(".msg-content");
    contentDiv.innerHTML = marked.parse(text);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// Auto-resize textarea
promptInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = (this.scrollHeight) + "px";
});
