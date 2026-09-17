function Popup() {
  return (
    <div className="popup">
      <h2>♟ Voice Chess</h2>
      <p>
        Open a game on chess.com (Play vs Computer, or a live game). Look for
        the floating mic button in the bottom-right corner of the page.
      </p>
      <p>
        Click it and say a move, like "knight to f3" or "pawn takes e5". For
        castling, say "castle kingside" or "castle queenside".
      </p>
      <p>
        This is a voice-input accessibility tool for practice and casual
        play — it plays exactly the move you say, with no move suggestions.
      </p>
    </div>
  );
}

export default Popup;
