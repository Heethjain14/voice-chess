import { ChessState } from "./chessState";

const chess = new ChessState();

console.log("Current FEN:");
console.log(chess.getFen());

console.log("Current turn:");
console.log(chess.getTurn());

console.log("Legal moves:");
console.log(chess.getLegalMoves());