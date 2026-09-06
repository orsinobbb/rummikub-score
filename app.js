(() => {
  "use strict";

  const STORAGE_KEY = "paika-rummikub-score:v1";
  const MAX_PLAYERS = 6;
  const MIN_PLAYERS = 2;
  const TIMER_DURATIONS = [60, 90];
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
    turnTimer: document.querySelector("#turn-timer"),
    timerPlayerAvatar: document.querySelector("#timer-player-avatar"),
    timerPlayerName: document.querySelector("#timer-player-name"),
    timerNextName: document.querySelector("#timer-next-name"),
    timerClock: document.querySelector("#timer-clock"),
    timerProgressBar: document.querySelector("#timer-progress-bar"),
    timerStatus: document.querySelector("#timer-status"),
    timerToggleButton: document.querySelector("#timer-toggle-button"),
    timerNextButton: document.querySelector("#timer-next-button"),
    mobileNextPlayerButton: document.querySelector("#mobile-next-player-button"),
    mobileNextPlayerLabel: document.querySelector("#mobile-next-player-label"),
    timerResetButton: document.querySelector("#timer-reset-button"),
    timerSoundButton: document.querySelector("#timer-sound-button"),
    timeoutEffect: document.querySelector("#timeout-effect"),
    timeoutPlayerName: document.querySelector("#timeout-player-name"),
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
  let timerInterval = null;
  let timeoutEffectTimer = null;
  let timerAudioContext = null;
  let turnTimer = {
    matchKey: null,
    status: "idle",
    remainingMs: 60000,
    deadline: 0,
  };

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

  function ensureTurnTimerState() {
    if (!state) return;
    const savedTimer = state.turnTimer || {};
    const duration = TIMER_DURATIONS.includes(Number(savedTimer.duration)) ? Number(savedTimer.duration) : 60;
    const currentPlayerId = state.players.some((player) => player.id === savedTimer.currentPlayerId)
      ? savedTimer.currentPlayerId
      : state.players[0].id;
    const soundEnabled = savedTimer.soundEnabled !== false;
    const needsSave =
      !state.turnTimer ||
      savedTimer.duration !== duration ||
      savedTimer.currentPlayerId !== currentPlayerId ||
      savedTimer.soundEnabled !== soundEnabled;

    state.turnTimer = { duration, currentPlayerId, soundEnabled };
    if (needsSave) saveState();
  }

  function stopTimerInterval() {
    if (timerInterval) window.clearInterval(timerInterval);
    timerInterval = null;
  }

  function hideTimeoutEffect() {
    window.clearTimeout(timeoutEffectTimer);
    timeoutEffectTimer = null;
    elements.timeoutEffect.hidden = true;
  }

  function syncTurnTimerRuntime() {
    ensureTurnTimerState();
    const matchKey = state.startedAt || state.players.map((player) => player.id).join("|");
    if (turnTimer.matchKey === matchKey) return;

    stopTimerInterval();
    hideTimeoutEffect();
    turnTimer = {
      matchKey,
      status: "idle",
      remainingMs: state.turnTimer.duration * 1000,
      deadline: 0,
    };
  }

  function getCurrentTurnPlayers() {
    ensureTurnTimerState();
    let index = state.players.findIndex((player) => player.id === state.turnTimer.currentPlayerId);
    if (index < 0) index = 0;
    return {
      current: state.players[index],
      next: state.players[(index + 1) % state.players.length],
      index,
    };
  }

  function formatTimer(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function renderTimer() {
    if (!state) return;
    const { current, next } = getCurrentTurnPlayers();
    const durationMs = state.turnTimer.duration * 1000;
    const ratio = Math.max(0, Math.min(1, turnTimer.remainingMs / durationMs));
    const secondsLeft = Math.max(0, Math.ceil(turnTimer.remainingMs / 1000));
    const isWarning = turnTimer.status === "running" && secondsLeft <= 10;
    const isOvertime = turnTimer.status === "overtime";

    elements.timerPlayerAvatar.textContent = getInitial(current.name);
    elements.timerPlayerAvatar.style.setProperty("--timer-player", current.color);
    elements.timerPlayerName.textContent = current.name;
    elements.timerNextName.textContent = `下一位：${next.name}`;
    elements.timerClock.textContent = formatTimer(turnTimer.remainingMs);
    elements.timerClock.dateTime = `PT${secondsLeft}S`;
    elements.timerProgressBar.style.transform = `scaleX(${ratio})`;
    elements.turnTimer.classList.toggle("is-warning", isWarning);
    elements.turnTimer.classList.toggle("is-overtime", isOvertime);

    const statusCopy = {
      idle: "準備好就開始計時",
      running: isWarning ? `最後 ${secondsLeft} 秒` : "正在倒數",
      paused: "已暫停，按繼續恢復",
      overtime: "時間到，請換下一位",
    };
    elements.timerStatus.textContent = statusCopy[turnTimer.status];

    const isRunning = turnTimer.status === "running";
    const toggleLabel = isRunning
      ? "暫停"
      : turnTimer.status === "paused"
        ? "繼續"
        : isOvertime
          ? "再計時"
          : "開始計時";
    const togglePath = isRunning ? "M8 6v12m8-12v12" : "m9 7 8 5-8 5V7Z";
    elements.timerToggleButton.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${togglePath}" /></svg><span>${toggleLabel}</span>`;
    elements.timerToggleButton.setAttribute("aria-label", toggleLabel);

    elements.turnTimer.querySelectorAll("[data-timer-duration]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.timerDuration) === state.turnTimer.duration));
    });

    const soundEnabled = state.turnTimer.soundEnabled;
    elements.timerSoundButton.setAttribute("aria-pressed", String(soundEnabled));
    elements.timerSoundButton.setAttribute("aria-label", soundEnabled ? "關閉逾時音效" : "開啟逾時音效");
    elements.timerSoundButton.title = soundEnabled ? "逾時音效已開啟" : "逾時音效已關閉";

    const nextCopy = `完成，換 ${next.name}`;
    elements.timerNextButton.querySelector("span").textContent = nextCopy;
    elements.mobileNextPlayerLabel.textContent = nextCopy;
    elements.timerNextButton.setAttribute("aria-label", nextCopy);
    elements.mobileNextPlayerButton.setAttribute("aria-label", nextCopy);
  }

  function primeTimerAudio() {
    if (!state?.turnTimer.soundEnabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!timerAudioContext || timerAudioContext.state === "closed") timerAudioContext = new AudioContextClass();
    if (timerAudioContext.state === "suspended") timerAudioContext.resume().catch(() => {});
  }

  function playTimeoutSound() {
    if (!state?.turnTimer.soundEnabled) return;
    primeTimerAudio();
    if (!timerAudioContext) return;

    const startAt = timerAudioContext.currentTime + 0.02;
    [
      { frequency: 784, offset: 0, duration: 0.22 },
      { frequency: 988, offset: 0.27, duration: 0.22 },
      { frequency: 784, offset: 0.54, duration: 0.38 },
    ].forEach(({ frequency, offset, duration }) => {
      const oscillator = timerAudioContext.createOscillator();
      const gain = timerAudioContext.createGain();
      const noteStart = startAt + offset;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.13, noteStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);
      oscillator.connect(gain);
      gain.connect(timerAudioContext.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + duration + 0.02);
    });
  }

  function showTimeoutEffect(playerName) {
    hideTimeoutEffect();
    elements.timeoutPlayerName.textContent = `${playerName} 的時間到了，請換下一位`;
    elements.timeoutEffect.hidden = false;
    void elements.timeoutEffect.offsetWidth;
    timeoutEffectTimer = window.setTimeout(hideTimeoutEffect, 1800);
  }

  function expireTurnTimer() {
    if (turnTimer.status === "overtime") return;
    const { current } = getCurrentTurnPlayers();
    stopTimerInterval();
    turnTimer.status = "overtime";
    turnTimer.remainingMs = 0;
    turnTimer.deadline = 0;
    renderTimer();
    playTimeoutSound();
    showTimeoutEffect(current.name);
    if (navigator.vibrate) navigator.vibrate([180, 90, 260]);
    elements.liveRegion.textContent = `${current.name} 的時間到了，請換下一位玩家`;
  }

  function tickTurnTimer() {
    if (turnTimer.status !== "running") return;
    turnTimer.remainingMs = Math.max(0, turnTimer.deadline - Date.now());
    if (turnTimer.remainingMs <= 0) {
      expireTurnTimer();
      return;
    }
    renderTimer();
  }

  function startTurnTimer() {
    if (!state) return;
    syncTurnTimerRuntime();
    hideTimeoutEffect();
    if (turnTimer.status === "overtime" || turnTimer.remainingMs <= 0) {
      turnTimer.remainingMs = state.turnTimer.duration * 1000;
    }
    primeTimerAudio();
    turnTimer.status = "running";
    turnTimer.deadline = Date.now() + turnTimer.remainingMs;
    stopTimerInterval();
    timerInterval = window.setInterval(tickTurnTimer, 200);
    renderTimer();
  }

  function pauseTurnTimer() {
    if (turnTimer.status !== "running") return;
    turnTimer.remainingMs = Math.max(0, turnTimer.deadline - Date.now());
    stopTimerInterval();
    if (turnTimer.remainingMs <= 0) {
      expireTurnTimer();
      return;
    }
    turnTimer.status = "paused";
    turnTimer.deadline = 0;
    renderTimer();
  }

  function resetTurnTimer(keepRunning = false) {
    if (!state) return;
    stopTimerInterval();
    hideTimeoutEffect();
    turnTimer.remainingMs = state.turnTimer.duration * 1000;
    turnTimer.deadline = 0;
    turnTimer.status = "idle";
    if (keepRunning) startTurnTimer();
    else renderTimer();
  }

  function toggleTurnTimer() {
    if (turnTimer.status === "running") pauseTurnTimer();
    else startTurnTimer();
  }

  function setTimerDuration(duration) {
    if (!state || !TIMER_DURATIONS.includes(duration) || state.turnTimer.duration === duration) return;
    const keepRunning = turnTimer.status === "running";
    state.turnTimer.duration = duration;
    saveState();
    resetTurnTimer(keepRunning);
    showToast(`每位玩家改為 ${duration} 秒`);
  }

  function advanceTurnPlayer() {
    if (!state) return;
    const { next } = getCurrentTurnPlayers();
    state.turnTimer.currentPlayerId = next.id;
    saveState();
    resetTurnTimer();
    startTurnTimer();
    elements.liveRegion.textContent = `換 ${next.name}，開始 ${state.turnTimer.duration} 秒倒數`;
  }

  function toggleTimerSound() {
    if (!state) return;
    state.turnTimer.soundEnabled = !state.turnTimer.soundEnabled;
    saveState();
    if (state.turnTimer.soundEnabled) primeTimerAudio();
    renderTimer();
    showToast(state.turnTimer.soundEnabled ? "逾時音效已開啟" : "逾時音效已關閉");
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
      stopTimerInterval();
      hideTimeoutEffect();
      renderSetupInputs();
      document.title = "牌咖｜拉密計分";
      return;
    }

    syncTurnTimerRuntime();
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

    renderTimer();
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
      turnTimer: {
        duration: 60,
        currentPlayerId: players[0].id,
        soundEnabled: true,
      },
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
  elements.turnTimer.addEventListener("click", (event) => {
    const durationButton = event.target.closest("[data-timer-duration]");
    if (durationButton) setTimerDuration(Number(durationButton.dataset.timerDuration));
  });
  elements.timerToggleButton.addEventListener("click", toggleTurnTimer);
  elements.timerNextButton.addEventListener("click", advanceTurnPlayer);
  elements.mobileNextPlayerButton.addEventListener("click", advanceTurnPlayer);
  elements.timerResetButton.addEventListener("click", () => {
    const keepRunning = turnTimer.status === "running";
    resetTurnTimer(keepRunning);
    showToast(keepRunning ? "已重新開始倒數" : "計時器已重設");
  });
  elements.timerSoundButton.addEventListener("click", toggleTimerSound);
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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tickTurnTimer();
  });

  renderApp();
})();
