self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.url || "/training";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      includeUncontrolled: true,
      type: "window",
    });

    for (const client of clientList) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        if ("navigate" in client) {
          await client.navigate(targetUrl);
        }
        await client.focus();
        return;
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

self.addEventListener("push", (event) => {
  const fallback = {
    body: "回到训练页继续。",
    title: "休息结束",
    url: "/training",
  };
  let payload = fallback;
  if (event.data) {
    try {
      payload = { ...fallback, ...event.data.json() };
    } catch {
      payload = { ...fallback, body: event.data.text() || fallback.body };
    }
  }

  event.waitUntil(self.registration.showNotification(payload.title || fallback.title, {
    body: payload.body || fallback.body,
    badge: "/workout-icon.svg",
    data: { url: payload.url || fallback.url },
    icon: "/workout-icon.svg",
    renotify: true,
    tag: "workout-rest-complete",
  }));
});
