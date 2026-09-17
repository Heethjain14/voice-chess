chrome.runtime.onInstalled.addListener(() => {
  console.log("Voice Chess installed.");
});

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {

    if (message.type === "VOICE_MOVE") {

      chrome.tabs.query(
        {
          active: true,
          currentWindow: true
        },
        tabs => {

          const tab = tabs[0];

          if (!tab.id) {
            sendResponse({
              success: false
            });
            return;
          }

          chrome.tabs.sendMessage(
            tab.id,
            {
              type: "PLAY_MOVE",
              move: message.move
            },
            response => {
              sendResponse(response);
            }
          );
        }
      );

      return true;
    }
  }
);