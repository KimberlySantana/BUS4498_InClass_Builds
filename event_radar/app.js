(function () {
  "use strict";

  const config = window.EVENT_RADAR_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = String(config.publishableKey || "");
  const agentUrl = supabaseUrl + "/functions/v1/submit-event";
  const supabaseClient = supabaseUrl && publishableKey && window.supabase
    ? window.supabase.createClient(supabaseUrl, publishableKey)
    : null;
  const selectColumns = [
    "id",
    "created_at",
    "status",
    "title",
    "club",
    "event_date",
    "start_time",
    "end_time",
    "place_name",
    "place_detail",
    "cost",
    "free_food",
    "summary",
    "flyer_url",
  ].join(",");

  const board = document.getElementById("event-board");
  const boardStatus = document.getElementById("board-status");
  const form = document.getElementById("post-form");
  const announcement = document.getElementById("announcement");
  const flyerInput = document.getElementById("flyer");
  const submitButton = document.getElementById("submit-button");
  const refreshButton = document.getElementById("refresh-button");
  const result = document.getElementById("result");
  const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
  const moderatorSignedOut = document.getElementById("moderator-signed-out");
  const moderatorSignedIn = document.getElementById("moderator-signed-in");
  const signInForm = document.getElementById("sign-in-form");
  const signInButton = document.getElementById("sign-in-button");
  const signOutButton = document.getElementById("sign-out-button");
  const moderatorStatus = document.getElementById("moderator-status");
  const waitingBoard = document.getElementById("waiting-board");
  let events = [];
  let activeFilter = "all";
  let currentUser = null;

  function makeElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatDate(dateText) {
    if (!dateText) return null;
    const date = new Date(dateText + "T12:00:00");
    if (Number.isNaN(date.getTime())) return null;
    return {
      month: date.toLocaleDateString("en-US", { month: "short" }),
      day: date.toLocaleDateString("en-US", { day: "numeric" }),
      full: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    };
  }

  function formatTime(timeText) {
    if (!timeText) return "";
    const parts = timeText.slice(0, 5).split(":").map(Number);
    if (parts.length !== 2 || parts.some(Number.isNaN)) return "";
    const date = new Date(1970, 0, 1, parts[0], parts[1]);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function formatWhen(event) {
    const date = formatDate(event.event_date);
    const start = formatTime(event.start_time);
    const end = formatTime(event.end_time);
    if (!date && !start) return "Date and time to be announced";
    if (!date) return end ? start + " to " + end : start;
    if (!start) return date.full + " · Time to be announced";
    return date.full + " · " + start + (end ? " to " + end : "");
  }

  function formatMeta(event) {
    const place = [event.place_name, event.place_detail].filter(Boolean).join(", ");
    return [event.club, place].filter(Boolean).join(" · ");
  }

  function makeEventCard(event) {
    const item = makeElement("li", "event");
    const date = formatDate(event.event_date);
    const dateBox = makeElement("div", date ? "date" : "date tba");
    if (date) {
      dateBox.appendChild(makeElement("span", "mon", date.month));
      dateBox.appendChild(makeElement("span", "day", date.day));
    } else {
      dateBox.appendChild(makeElement("span", "day", "TBA"));
    }

    const body = makeElement("div", "event-body");
    body.appendChild(makeElement("p", "when", formatWhen(event)));
    body.appendChild(makeElement("h3", "", event.title || "Untitled event"));
    body.appendChild(makeElement("p", "meta", formatMeta(event) || "Campus place to be announced"));
    body.appendChild(makeElement("p", "summary", event.summary || "More details to come."));

    const tags = makeElement("p", "tags");
    if (event.cost) tags.appendChild(makeElement("span", "tag", event.cost));
    if (event.free_food) tags.appendChild(makeElement("span", "tag food", "🍕 Free food"));
    if (tags.childNodes.length) body.appendChild(tags);

    item.appendChild(dateBox);
    item.appendChild(body);
    const flyerPrefix = supabaseUrl + "/storage/v1/object/public/flyers/";
    if (typeof event.flyer_url === "string" && event.flyer_url.startsWith(flyerPrefix)) {
      const image = document.createElement("img");
      image.className = "flyer";
      image.src = event.flyer_url;
      image.alt = event.title ? "Flyer for " + event.title : "Event flyer";
      image.loading = "lazy";
      item.appendChild(image);
    }
    return item;
  }

  function renderEvents() {
    board.replaceChildren();
    const visibleEvents = activeFilter === "food" ? events.filter((event) => event.free_food) : events;
    if (!visibleEvents.length) {
      board.appendChild(makeElement("li", "empty", activeFilter === "food" ? "No free-food events yet." : "No events yet. Post the first one!"));
      return;
    }
    visibleEvents.forEach((event) => board.appendChild(makeEventCard(event)));
  }

  function setBoardStatus(text) {
    boardStatus.textContent = text;
  }

  async function loadEvents() {
    if (!supabaseClient) {
      setBoardStatus("Add the Supabase settings in config.js to load events.");
      renderEvents();
      return;
    }

    setBoardStatus("Loading events…");
    const response = await supabaseClient
      .from("events")
      .select(selectColumns)
      .eq("status", "published")
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (response.error) {
      setBoardStatus("The event board could not load right now.");
      board.replaceChildren(makeElement("li", "empty", "Check the Supabase table permissions, then refresh."));
      console.error("Could not load events", response.error);
      return;
    }

    events = response.data || [];
    setBoardStatus(events.length === 1 ? "1 event" : events.length + " events");
    renderEvents();
  }

  function setModeratorStatus(text) {
    moderatorStatus.textContent = text;
  }

  function moderatorEventCard(event) {
    const item = makeEventCard(event);
    const review = makeElement("div", "review");
    review.appendChild(makeElement("p", "why", event.status_reason || "This post needs a moderator decision."));
    review.appendChild(makeElement("p", "original", "Original post: " + (event.announcement || "")));

    const actions = makeElement("p", "actions");
    const approve = makeElement("button", "", "Approve");
    approve.type = "button";
    const reject = makeElement("button", "ghost", "Reject");
    reject.type = "button";
    approve.addEventListener("click", () => reviewEvent(event, "published", approve, reject));
    reject.addEventListener("click", () => reviewEvent(event, "rejected", approve, reject));
    actions.appendChild(approve);
    actions.appendChild(reject);
    review.appendChild(actions);
    item.appendChild(review);
    return item;
  }

  async function loadWaiting() {
    if (!supabaseClient || !currentUser) {
      waitingBoard.replaceChildren();
      return;
    }

    setModeratorStatus("Loading waiting posts…");
    const response = await supabaseClient
      .from("events")
      .select("*")
      .eq("status", "waiting")
      .order("created_at", { ascending: true });

    if (response.error) {
      waitingBoard.replaceChildren(makeElement("li", "empty", "Waiting posts could not load."));
      setModeratorStatus("The moderator list could not load right now.");
      console.error("Could not load waiting posts", response.error);
      return;
    }

    waitingBoard.replaceChildren();
    const waiting = response.data || [];
    setModeratorStatus(waiting.length === 1 ? "1 post needs review." : waiting.length + " posts need review.");
    if (!waiting.length) {
      waitingBoard.appendChild(makeElement("li", "empty", "No posts are waiting for review."));
      return;
    }
    waiting.forEach((event) => waitingBoard.appendChild(moderatorEventCard(event)));
  }

  async function reviewEvent(event, status, approveButton, rejectButton) {
    if (!supabaseClient || !currentUser) return;
    approveButton.disabled = true;
    rejectButton.disabled = true;
    setModeratorStatus(status === "published" ? "Approving post…" : "Rejecting post…");

    const update = {
      status,
      status_reason: status === "published" ? "Approved by moderator." : "Rejected by moderator.",
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentUser.id,
    };
    const response = await supabaseClient.from("events").update(update).eq("id", event.id);
    if (response.error) {
      approveButton.disabled = false;
      rejectButton.disabled = false;
      setModeratorStatus("That review could not be saved.");
      console.error("Could not save event review", response.error);
      return;
    }

    await loadWaiting();
    await loadEvents();
  }

  function updateModeratorView() {
    const signedIn = Boolean(currentUser);
    moderatorSignedOut.hidden = signedIn;
    moderatorSignedIn.hidden = !signedIn;
    if (!signedIn) {
      waitingBoard.replaceChildren();
      return;
    }
    setModeratorStatus("Signed in as " + (currentUser.email || "moderator") + ".");
  }

  async function initializeModerator() {
    if (!supabaseClient) {
      setModeratorStatus("Add the Supabase settings in config.js to use moderator sign-in.");
      return;
    }

    const sessionResponse = await supabaseClient.auth.getSession();
    currentUser = sessionResponse.data.session ? sessionResponse.data.session.user : null;
    updateModeratorView();
    if (currentUser) await loadWaiting();

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      currentUser = session ? session.user : null;
      updateModeratorView();
      if (currentUser) setTimeout(loadWaiting, 0);
    });
  }

  async function signInModerator(event) {
    event.preventDefault();
    if (!supabaseClient) return;
    signInButton.disabled = true;
    signInButton.textContent = "Signing in…";
    setModeratorStatus("Signing in…");
    const email = document.getElementById("moderator-email").value.trim();
    const password = document.getElementById("moderator-password").value;
    const response = await supabaseClient.auth.signInWithPassword({ email, password });
    if (response.error) {
      setModeratorStatus("Sign-in failed. Check the email and password.");
      console.error("Moderator sign-in failed", response.error);
    } else {
      signInForm.reset();
      setModeratorStatus("Signed in.");
    }
    signInButton.disabled = false;
    signInButton.textContent = "Sign in";
  }

  async function signOutModerator() {
    if (!supabaseClient) return;
    const response = await supabaseClient.auth.signOut();
    if (response.error) {
      setModeratorStatus("Sign-out failed. Try again.");
      console.error("Moderator sign-out failed", response.error);
    }
  }

  function resultLabel(status) {
    if (status === "published") return "Posted";
    if (status === "waiting") return "Needs moderator review";
    if (status === "rejected") return "Not posted";
    if (status === "duplicate") return "Already posted";
    return "Something went wrong";
  }

  function showResult(status, message, reasons) {
    result.replaceChildren();
    result.className = "result " + (status || "error");
    result.hidden = false;
    result.appendChild(makeElement("p", "result-label", resultLabel(status)));
    result.appendChild(makeElement("p", "", message || "The event agent did not return a message."));
    if (Array.isArray(reasons) && reasons.length) {
      const list = makeElement("ul", "reasons");
      reasons.forEach((reason) => list.appendChild(makeElement("li", "", reason)));
      result.appendChild(list);
    }
  }

  async function submitAnnouncement(event) {
    event.preventDefault();
    if (!supabaseUrl || !publishableKey) {
      showResult("error", "The website is missing its Supabase settings.", []);
      return;
    }

    const text = announcement.value.trim();
    if (!text) {
      showResult("error", "Add an announcement before sending.", []);
      announcement.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Checking…";
    result.hidden = true;
    try {
      const body = new FormData();
      body.append("announcement", text);
      const flyer = flyerInput.files && flyerInput.files[0];
      if (flyer) body.append("flyer", flyer, flyer.name);
      const response = await fetch(agentUrl, {
        method: "POST",
        headers: { apikey: publishableKey },
        body,
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        showResult("error", payload.message || "The event agent could not process that post.", payload.reasons || []);
        return;
      }
      showResult(payload.status, payload.message, payload.reasons);
      if (payload.status === "published") {
        form.reset();
        await loadEvents();
      }
    } catch (error) {
      console.error("Could not submit announcement", error);
      showResult("error", "The website could not reach the event agent.", []);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send announcement";
    }
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter || "all";
      filterButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      renderEvents();
    });
  });

  form.addEventListener("submit", submitAnnouncement);
  refreshButton.addEventListener("click", loadEvents);
  signInForm.addEventListener("submit", signInModerator);
  signOutButton.addEventListener("click", signOutModerator);
  loadEvents();
  initializeModerator();
})();
