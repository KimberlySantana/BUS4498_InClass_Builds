(function () {
  "use strict";

  const config = window.EVENT_RADAR_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = String(config.publishableKey || "");
  const agentUrl = supabaseUrl + "/functions/v1/submit-event";
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
  let events = [];
  let activeFilter = "all";

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
    if (!supabaseUrl || !publishableKey || !window.supabase) {
      setBoardStatus("Add the Supabase settings in config.js to load events.");
      renderEvents();
      return;
    }

    setBoardStatus("Loading events…");
    const client = window.supabase.createClient(supabaseUrl, publishableKey);
    const response = await client
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
  loadEvents();
})();
