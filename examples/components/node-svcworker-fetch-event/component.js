addEventListener("fetch", (event) =>
  event.respondWith(
    (async () => {
      console.log("received fetch event", event);
      return new Response("whoopsies");
    })(),
  ),
);
