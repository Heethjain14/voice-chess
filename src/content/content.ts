console.log("Voice Chess content script loaded.");

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {

    if (message.type === "PLAY_MOVE") {

      console.log(
        "Requested move:",
        message.move
      );

      const result = playMoveOnBoard(
        message.move.from,
        message.move.to
      );

      sendResponse({
        success: result
      });
    }

    return true;
  }
);

function playMoveOnBoard(
  from: string,
  to: string
): boolean {

  console.log(
    `Attempting ${from} → ${to}`
  );

  /*
   * Chess.com board interaction
   * will be implemented here.
   */

  return false;
}