(function () {
  "use strict";

  var counter = document.querySelector("[data-visitor-counter]");
  if (!counter || !window.fetch) return;

  var namespace = counter.getAttribute("data-counter-namespace");
  var productionHost = counter.getAttribute("data-production-host");
  var todayOutput = counter.querySelector("[data-visitor-today]");
  var totalOutput = counter.querySelector("[data-visitor-total]");
  var apiBase = "https://api.counterapi.dev/v1/" + encodeURIComponent(namespace);
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

  function requestCount(name, shouldIncrement, storageKey) {
    var endpoint = apiBase + "/" + encodeURIComponent(name);

    if (shouldIncrement) {
      window.localStorage.setItem(storageKey, today);
      endpoint += "/up";
    }

    return window
      .fetch(endpoint, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Visitor counter request failed");
        return response.json();
      })
      .then(function (data) {
        return Number(data.count).toLocaleString();
      })
      .catch(function () {
        if (shouldIncrement && window.localStorage.getItem(storageKey) === today) {
          window.localStorage.removeItem(storageKey);
        }
        return "–";
      });
  }

  var canStore = storageAvailable();
  var isProduction = window.location.hostname === productionHost;
  var todayStorageKey = "hodolog:visitor:today";
  var totalStorageKey = "hodolog:visitor:total";
  var countToday = isProduction && canStore && window.localStorage.getItem(todayStorageKey) !== today;
  var countTotal = isProduction && canStore && window.localStorage.getItem(totalStorageKey) !== today;

  Promise.all([
    requestCount("visitors-" + today, countToday, todayStorageKey),
    requestCount("visitors-total", countTotal, totalStorageKey),
  ]).then(function (counts) {
    todayOutput.textContent = counts[0];
    totalOutput.textContent = counts[1];
  });
})();
