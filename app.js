(() => {
  "use strict";

  const STORAGE_KEY = "paika-rummikub-score:v1";
  const MAX_PLAYERS = 6;
  const MIN_PLAYERS = 2;
  const COLORS = ["#d95b43", "#3177a5", "#d99a2f", "#2f7563", "#765b93", "#a9586b"];

  const elements = {
    setupView: document.querySelector("#setup-view"),
    matchView: document.querySelector("#match-view"),
    setupForm: document.querySelector("#setup-form"),
    playerInputList: document.querySelector("#player-input-list"),
    playerCount: document.querySelector("#player-count"),
    addPlayerButton: document.querySelector("#add-player-button"),
    headerActions: document.querySelector("#header-actions"),
    resetButton: document.querySelector("#reset-button"),
    shareButton: document.querySelector("#share-button"),
    matchSubtitle: document.querySelector("#match-subtitle"),
    heroLeader: document.querySelector("#hero-leader"),
    scoreboard: document.querySelector("#scoreboard"),
    roundCount: document.querySelector("#round-count"),
    emptyHistory: document.querySelector("#empty-history"),
    historyList: document.querySelector("#history-list"),
    newRoundButton: document.querySelector("#new-round-button"),
    mobileNewRoundButton: document.querySelector("#mobile-new-round-button"),
    mobileRoundBar: document.querySelector("#mobile-round-bar"),
    roundDialog: document.querySelector("#round-dialog"),
    roundForm: document.querySelector("#round-form"),
    roundStepLabel: document.querySelector("#round-step-label"),
    roundDialogTitle: document.querySelector("#round-dialog-title"),
    winnerOptions: document.querySelector("#winner-options"),
    roundScoreInputs: document.querySelector("#round-score-inputs"),
    roundError: document.querySelector("#round-error"),
    winnerTotal: document.querySelector("#winner-total"),
    saveRoundButton: document.querySelector("#save-round-button"),
    deleteRoundDialog: document.querySelector("#delete-round-dialog"),
    deleteDialogCopy: document.querySelector("#delete-dialog-copy"),
    confirmDeleteButton: document.querySelector("#confirm-delete-button"),
    resetDialog: document.querySelector("#reset-dialog"),
    confirmResetButton: document.querySelector("#confirm-reset-button"),
    toast: document.querySelector("#toast"),
    toastMessage: document.querySelector("#toast-message"),
    liveRegion: document.querySelector("#live-region"),
  };

  let state = loadState();
  let setupNames = ["", "", "", ""];
  let selectedWinnerId = null;
  let pendingDeleteRoundId = null;
  let toastTimer = null;

  function uid(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.players) || !Array.isArray(parsed.rounds)) {
        return null;
      }
      if (parsed.players.length < MIN_PLAYERS || parsed.players.length > MAX_PLAYERS) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function formatSigned(number) {
    if (number > 0) return `+${number}`;
    return String(number);
  }

  function getInitial(name) {
    return Array.from(name.trim())[0]?.toUpperCase() || "玩";
  }

  function getTotals() {
    const totals = Object.fromEntries(state.players.map((player) => [player.id, 0]));
    for (const round of state.rounds) {
      for (const player of state.players) {
        totals[player.id] += Number(round.deltas[player.id] || 0);
      }
    }
    return totals;
  }

  function getWinCounts() {
    const wins = Object.fromEntries(state.players.map((player) => [player.id, 0]));
    for (const round of state.rounds) {
      if (round.winnerId in wins) wins[round.winnerId] += 1;
    }
    return wins;
  }

  function getSortedPlayers() {
    const totals = getTotals();
    return [...state.players].sort((a, b) => {
      const difference = totals[b.id] - totals[a.id];
      return difference || state.players.findIndex((player) => player.id === a.id) - state.players.findIndex((player) => player.id === b.id);
    });
  }

  function renderSetupInputs(focusLast = false) {
    elements.playerInputList.innerHTML = setupNames
      .map(
        (name, index) => `
          <div class="player-input-row">
            <span class="player-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
            <label class="sr-only" for="player-${index}">玩家 ${index + 1} 名字</label>
            <input
              id="player-${index}"
              name="player-${index}"
              type="text"
              value="${escapeHtml(name)}"
              placeholder="玩家 ${index + 1}"
              maxlength="12"
              autocomplete="off"
              data-player-index="${index}"
            />
            <button
              class="remove-player-button"
              type="button"
              data-remove-player="${index}"
              aria-label="移除玩家 ${index + 1}"
              ${setupNames.length <= MIN_PLAYERS ? "disabled" : ""}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
            </button>
          </div>`,
      )
      .join("");

    elements.playerCount.textContent = `${setupNames.length} 人`;
    elements.addPlayerButton.disabled = setupNames.length >= MAX_PLAYERS;
    elements.addPlayerButton.setAttribute(
      "aria-label",
      setupNames.length >= MAX_PLAYERS ? "最多六位玩家" : "加一位玩家",
    );

    if (focusLast) {
      requestAnimationFrame(() => elements.playerInputList.querySelector("input:last-of-type")?.focus());
    }
  }

  function renderApp() {
    const hasMatch = Boolean(state);
    elements.setupView.hidden = hasMatch;
    elements.matchView.hidden = !hasMatch;
    elements.headerActions.hidden = !hasMatch;
    elements.mobileRoundBar.hidden = !hasMatch;

    if (!hasMatch) {
      renderSetupInputs();
      document.title = "牌咖｜拉密計分";
      return;
    }

    renderMatch();
  }

  function renderMatch() {
    const totals = getTotals();
    const wins = getWinCounts();
    const sortedPlayers = getSortedPlayers();
    const leader = sortedPlayers[0];
    const lastRound = state.rounds.at(-1);

    document.title = state.rounds.length ? `${leader.name} 領先｜牌咖拉密計分` : "今晚戰況｜牌咖拉密計分";
    elements.matchSubtitle.textContent = state.rounds.length
      ? `已完成 ${state.rounds.length} 局 · 分數自動儲存在這台裝置`
      : `${state.players.length} 位玩家已就位，牌局才正要開始`;

    elements.heroLeader.innerHTML = state.rounds.length
      ? `<div class="leader-crown" aria-hidden="true">♛</div>
         <div><span>CURRENT LEADER</span><strong>${escapeHtml(leader.name)} · ${formatSigned(totals[leader.id])}</strong></div>`
      : `<div class="leader-crown" aria-hidden="true">◇</div>
         <div><span>READY TO PLAY</span><strong>${state.players.length} 位牌咖就位</strong></div>`;

    elements.scoreboard.innerHTML = sortedPlayers
      .map((player, index) => {
        const lastDelta = lastRound ? Number(lastRound.deltas[player.id] || 0) : 0;
        const deltaClass = lastDelta > 0 ? "positive" : lastDelta < 0 ? "negative" : "";
        const deltaText = lastRound ? `本局 ${formatSigned(lastDelta)}` : "等待開局";
        return `
          <li class="score-row">
            <span class="rank-number" aria-label="第 ${index + 1} 名">${index === 0 && state.rounds.length ? "♛" : String(index + 1).padStart(2, "0")}</span>
            <span class="player-avatar" style="--avatar:${player.color}" aria-hidden="true">${escapeHtml(getInitial(player.name))}</span>
            <div class="player-info">
              <strong>${escapeHtml(player.name)}</strong>
              <span>${wins[player.id]} 勝 · ${state.rounds.length} 局</span>
            </div>
            <div class="player-score">
              <strong>${formatSigned(totals[player.id])}</strong>
              <span class="${deltaClass}">${deltaText}</span>
            </div>
          </li>`;
      })
      .join("");

    elements.roundCount.textContent = `${state.rounds.length} 局`;
    elements.emptyHistory.hidden = state.rounds.length > 0;
    elements.historyList.hidden = state.rounds.length === 0;
    elements.historyList.innerHTML = [...state.rounds]
      .map((round, index) => ({ round, number: index + 1 }))
      .reverse()
      .map(({ round, number }) => {
        const winner = state.players.find((player) => player.id === round.winnerId);
        const total = Number(round.deltas[round.winnerId] || 0);
        const time = new Intl.DateTimeFormat("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(round.createdAt));

        const chips = state.players
          .map((player) => {
            const delta = Number(round.deltas[player.id] || 0);
            return `<span class="delta-chip ${delta > 0 ? "win" : ""}">${escapeHtml(player.name)} ${formatSigned(delta)}</span>`;
          })
          .join("");

        return `
          <li class="history-item">
            <div class="history-topline">
              <span class="history-round">ROUND ${String(number).padStart(2, "0")}</span>
              <time class="history-time" datetime="${escapeHtml(round.createdAt)}">${time}</time>
            </div>
            <p class="history-winner"><strong>${escapeHtml(winner?.name || "玩家")}</strong> 贏得 ${formatSigned(total)} 分</p>
            <div class="history-deltas">${chips}</div>
            <button class="history-delete" type="button" data-delete-round="${round.id}" aria-label="刪除第 ${number} 局">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6" /></svg>
            </button>
          </li>`;
      })
      .join("");
  }

  function startMatch(event) {
    event.preventDefault();
    const inputs = [...elements.playerInputList.querySelectorAll("input")];
    const usedNames = new Set();

    const players = inputs.map((input, index) => {
      let name = input.value.trim() || `玩家 ${index + 1}`;
      const baseName = name;
      let suffix = 2;
      while (usedNames.has(name.toLocaleLowerCase("zh-Hant"))) {
        name = `${baseName} ${suffix}`;
        suffix += 1;
      }
      usedNames.add(name.toLocaleLowerCase("zh-Hant"));
      return { id: uid("player"), name, color: COLORS[index] };
    });

    state = {
      version: 1,
      startedAt: new Date().toISOString(),
      players,
      rounds: [],
    };
    saveState();
    renderApp();
    window.scrollTo({ top: 0, behavior: "smooth" });
    elements.liveRegion.textContent = `牌局開始，共 ${players.length} 位玩家`;
  }

  function openRoundDialog() {
    selectedWinnerId = null;
    const roundNumber = state.rounds.length + 1;
    elements.roundStepLabel.textContent = `ROUND ${String(roundNumber).padStart(2, "0")}`;
    elements.roundDialogTitle.textContent = "這局誰先出完？";
    elements.roundError.textContent = "";
    elements.roundScoreInputs.innerHTML = "";

    elements.winnerOptions.innerHTML = state.players
      .map(
        (player) => `
          <button class="winner-option" type="button" data-winner-id="${player.id}" aria-pressed="false">
            <span class="winner-avatar" style="--avatar:${player.color}" aria-hidden="true">${escapeHtml(getInitial(player.name))}</span>
            <span class="winner-name">${escapeHtml(player.name)}</span>
            <span class="winner-check" aria-hidden="true">✓</span>
          </button>`,
      )
      .join("");

    renderRoundScoreInputs();
    elements.saveRoundButton.textContent = "";
    elements.saveRoundButton.insertAdjacentHTML(
      "afterbegin",
      `儲存第 ${roundNumber} 局 <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>`,
    );
    elements.roundDialog.showModal();
  }

  function renderRoundScoreInputs() {
    const previousValues = {};
    elements.roundScoreInputs.querySelectorAll("input").forEach((input) => {
      previousValues[input.dataset.scorePlayer] = input.value;
    });

    elements.roundScoreInputs.innerHTML = state.players
      .map((player) => {
        const isWinner = player.id === selectedWinnerId;
        return `
          <label class="round-score-row ${isWinner ? "is-winner" : ""}">
            <span class="round-player">
              <span class="round-player-dot" style="--avatar:${player.color}" aria-hidden="true"></span>
              <strong>${escapeHtml(player.name)}</strong>
            </span>
            ${
              isWinner
                ? '<span class="winner-label">本局贏家</span>'
                : `<span class="round-score-control">
                    <input
                      type="number"
                      min="0"
                      max="999"
                      step="1"
                      inputmode="numeric"
                      autocomplete="off"
                      data-score-player="${player.id}"
                      value="${escapeHtml(previousValues[player.id] || "")}"
                      aria-label="${escapeHtml(player.name)}的剩餘牌分"
                    />
                    <span>分</span>
                  </span>`
            }
          </label>`;
      })
      .join("");

    updateRoundTotal();
  }

  function chooseWinner(playerId) {
    selectedWinnerId = playerId;
    elements.winnerOptions.querySelectorAll("[data-winner-id]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.winnerId === playerId));
    });
    renderRoundScoreInputs();
    const firstInput = elements.roundScoreInputs.querySelector("input");
    requestAnimationFrame(() => firstInput?.focus());
  }

  function getRoundEntry() {
    const inputs = [...elements.roundScoreInputs.querySelectorAll("input")];
    const scores = {};
    let isValid = Boolean(selectedWinnerId) && inputs.length === state.players.length - 1;

    for (const input of inputs) {
      const raw = input.value.trim();
      const value = Number(raw);
      const validValue = raw !== "" && Number.isInteger(value) && value >= 0 && value <= 999;
      input.setAttribute("aria-invalid", String(!validValue));
      if (!validValue) isValid = false;
      scores[input.dataset.scorePlayer] = validValue ? value : 0;
    }

    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    return { scores, total, isValid };
  }

  function updateRoundTotal() {
    const { total, isValid } = getRoundEntry();
    elements.winnerTotal.textContent = `+${total}`;
    elements.saveRoundButton.disabled = !isValid;
    if (elements.roundError.textContent) elements.roundError.textContent = "";
  }

  function saveRound() {
    const { scores, total, isValid } = getRoundEntry();
    if (!isValid || !selectedWinnerId) {
      elements.roundError.textContent = selectedWinnerId ? "請填妥每位玩家的剩餘牌分。" : "請先選擇本局贏家。";
      return;
    }

    const deltas = {};
    for (const player of state.players) {
      deltas[player.id] = player.id === selectedWinnerId ? total : -Number(scores[player.id] || 0);
    }

    state.rounds.push({
      id: uid("round"),
      createdAt: new Date().toISOString(),
      winnerId: selectedWinnerId,
      scores,
      deltas,
    });
    saveState();
    elements.roundDialog.close();
    renderMatch();
    showToast(`第 ${state.rounds.length} 局已記錄`);
    elements.liveRegion.textContent = `第 ${state.rounds.length} 局已儲存`;
  }

  function askToDeleteRound(roundId) {
    pendingDeleteRoundId = roundId;
    const index = state.rounds.findIndex((round) => round.id === roundId);
    if (index < 0) return;
    const round = state.rounds[index];
    const winner = state.players.find((player) => player.id === round.winnerId);
    elements.deleteDialogCopy.textContent = `第 ${index + 1} 局由 ${winner?.name || "玩家"} 獲勝。刪除後，所有人的總分都會重新計算。`;
    elements.deleteRoundDialog.showModal();
  }

  function deletePendingRound() {
    if (!pendingDeleteRoundId) return;
    const index = state.rounds.findIndex((round) => round.id === pendingDeleteRoundId);
    if (index < 0) return;
    state.rounds.splice(index, 1);
    pendingDeleteRoundId = null;
    saveState();
    renderMatch();
    showToast("牌局紀錄已刪除，總分已更新");
  }

  function resetMatch() {
    state = null;
    setupNames = ["", "", "", ""];
    localStorage.removeItem(STORAGE_KEY);
    renderApp();
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("已準備好一場新牌局");
  }

  function buildShareText() {
    const totals = getTotals();
    const wins = getWinCounts();
    const ranking = getSortedPlayers();
    const lines = ranking.map(
      (player, index) => `${index + 1}. ${player.name}｜${formatSigned(totals[player.id])} 分｜${wins[player.id]} 勝`,
    );
    return [`牌咖｜拉密戰況`, `已完成 ${state.rounds.length} 局`, "", ...lines, "", "用牌咖，專心出牌不用算分。"].join("\n");
  }

  async function shareStandings() {
    const text = buildShareText();
    try {
      if (navigator.share) {
        await navigator.share({ title: "牌咖｜拉密戰況", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast("戰況已複製，可以貼給牌友了");
    } catch (error) {
      if (error?.name === "AbortError") return;
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.append(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
      showToast("戰況已複製，可以貼給牌友了");
    }
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toastMessage.textContent = message;
    elements.toast.classList.add("show");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
  }

  elements.playerInputList.addEventListener("input", (event) => {
    const index = Number(event.target.dataset.playerIndex);
    if (Number.isInteger(index)) setupNames[index] = event.target.value;
  });

  elements.playerInputList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-player]");
    if (!button || setupNames.length <= MIN_PLAYERS) return;
    setupNames.splice(Number(button.dataset.removePlayer), 1);
    renderSetupInputs();
  });

  elements.addPlayerButton.addEventListener("click", () => {
    if (setupNames.length >= MAX_PLAYERS) return;
    setupNames.push("");
    renderSetupInputs(true);
  });

  elements.setupForm.addEventListener("submit", startMatch);
  elements.newRoundButton.addEventListener("click", openRoundDialog);
  elements.mobileNewRoundButton.addEventListener("click", openRoundDialog);
  elements.resetButton.addEventListener("click", () => elements.resetDialog.showModal());
  elements.shareButton.addEventListener("click", shareStandings);

  elements.winnerOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-winner-id]");
    if (button) chooseWinner(button.dataset.winnerId);
  });

  elements.roundScoreInputs.addEventListener("input", updateRoundTotal);
  elements.saveRoundButton.addEventListener("click", saveRound);
  elements.roundForm.addEventListener("submit", (event) => {
    if (event.submitter?.value !== "cancel") event.preventDefault();
  });

  elements.historyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-round]");
    if (button) askToDeleteRound(button.dataset.deleteRound);
  });

  elements.confirmDeleteButton.addEventListener("click", deletePendingRound);
  elements.deleteRoundDialog.addEventListener("close", () => {
    if (elements.deleteRoundDialog.returnValue === "cancel") pendingDeleteRoundId = null;
  });
  elements.confirmResetButton.addEventListener("click", resetMatch);

  renderApp();
})();
