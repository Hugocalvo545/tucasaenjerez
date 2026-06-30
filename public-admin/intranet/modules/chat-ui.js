export function createChatUI({
  auth,
  db,
  serverTimestamp,
  increment,
  subscribeToChat,
  escapeHtml,
}) {
  const chatMessagesBox = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");

  let chatUnsubscribe = null;
  let currentChatReservaId = null;

  const events = new AbortController();
  let wired = false;

  function renderMessage(m) {
    const sender = m.sender || "guest";
    const text = escapeHtml(m.text || "");
    const date = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : "";
    const who = sender === "host" ? "Tú" : "Cliente";

    return `
      <div class="chat-msg chat-${escapeHtml(sender)}">
        <div class="chat-meta">${escapeHtml(who)} · ${escapeHtml(date)}</div>
        <div class="chat-text">${text}</div>
      </div>
    `;
  }

  function wireSubmitOnce() {
    if (wired) return;
    wired = true;

    chatForm?.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        if (!currentChatReservaId) return;

        const text = chatInput.value.trim();
        if (!text) return;

        try {
          const chatRef = db.collection("chats").doc(currentChatReservaId);
          const msgRef = chatRef.collection("mensajes").doc();

          const batch = db.batch();
          batch.set(msgRef, { text, sender: "host", createdAt: serverTimestamp() });
          batch.set(
            chatRef,
            {
              lastMessage: text,
              lastSender: "host",
              lastAt: serverTimestamp(),
              unreadGuest: increment(1),
            },
            { merge: true }
          );

          await batch.commit();
          chatInput.value = "";
        } catch (err) {
          console.error("Error enviando mensaje (host)", err);
        }
      },
      { signal: events.signal }
    );
  }

  async function markMessagesRead(reservaId) {
    try {
      const snap = await db
        .collection("chats").doc(reservaId)
        .collection("mensajes")
        .get();
      if (snap.empty) return;
      const batch = db.batch();
      let count = 0;
      snap.docs.forEach((d) => {
        const data = d.data() || {};
        if (data.sender !== "host" && !data.leido) {
          batch.update(d.ref, { leido: true });
          count++;
        }
      });
      if (count > 0) await batch.commit();
    } catch (e) {
      console.warn("markMessagesRead error:", e);
    }
  }

  function openChatForReserva(reservaId) {
    if (!reservaId) return;

    wireSubmitOnce();

    currentChatReservaId = reservaId;

    db.collection("chats")
      .doc(currentChatReservaId)
      .set({ unreadHost: 0 }, { merge: true })
      .catch(() => {});

    markMessagesRead(reservaId);

    if (!chatMessagesBox) return;

    chatMessagesBox.innerHTML = `<div class="muted">Cargando chat...</div>`;

    if (chatUnsubscribe) chatUnsubscribe();

    chatUnsubscribe = subscribeToChat(
      reservaId,
      (mensajes) => {
        if (!mensajes || !mensajes.length) {
          chatMessagesBox.innerHTML = `<div class="muted">No hay mensajes aún.</div>`;
          return;
        }

        chatMessagesBox.innerHTML = mensajes.map(renderMessage).join("");
        chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
      },
      (err) => {
        console.error("Error al cargar el chat", err);
        chatMessagesBox.innerHTML = `<div class="muted">Error al cargar el chat.</div>`;
      }
    );
  }

  function destroy() {
    if (chatUnsubscribe) {
      chatUnsubscribe();
      chatUnsubscribe = null;
    }
    events.abort();
    currentChatReservaId = null;
  }

  return { openChatForReserva, destroy };
}