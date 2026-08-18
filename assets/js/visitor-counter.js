(function () {
  "use strict";

  var counter = document.querySelector("[data-visitor-counter]");
  if (!counter || !window.fetch) return;

  var productionHost = counter.getAttribute("data-production-host");
  var todayOutput = counter.querySelector("[data-visitor-today]");
  var totalOutput = counter.querySelector("[data-visitor-total]");
  var apiEndpoint =
    "https://hodolog-visitor-counter.wlghks0618.workers.dev/counter" +
    "?name=first-counter-5078";
  var now = new Date();
  var today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  function storageAvailable() {
    try {
      var key = "__visitor_counter_test__";
      window.localStorage.setItem(key, key);
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function requestCounts(shouldIncrement, storageKey) {
    var endpoint = apiEndpoint;

    if (shouldIncrement) {
      window.localStorage.setItem(storageKey, today);
      endpoint += "&increment=true";
    }

    return window
      .fetch(endpoint, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Visitor counter request failed");
        return response.json();
      })
      .then(function (data) {
        var todayCount = Number(data.today);
        var totalCount = Number(data.total);
        if (!Number.isFinite(todayCount) || !Number.isFinite(totalCount)) {
          throw new Error("Visitor counter response is invalid");
        }

        return {
          today: todayCount.toLocaleString(),
          total: totalCount.toLocaleString(),
        };
      })
      .catch(function () {
        if (shouldIncrement && window.localStorage.getItem(storageKey) === today) {
          window.localStorage.removeItem(storageKey);
        }
        return {
          today: "–",
          total: "–",
        };
      });
  }

  var canStore = storageAvailable();
  var isProduction = window.location.hostname === productionHost;
  var todayStorageKey = "hodolog:visitor:today";
  var shouldIncrement =
    isProduction &&
    canStore &&
    window.localStorage.getItem(todayStorageKey) !== today;

  requestCounts(shouldIncrement, todayStorageKey).then(function (counts) {
    todayOutput.textContent = counts.today;
    totalOutput.textContent = counts.total;
  });
})();
