import "./TouchKeyboard.css";

const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export default function TouchKeyboard({ onLetter, pressed = false }) {
  return (
    <div className="touch-keyboard" role="group" aria-label="Letter keyboard">
      <p className="touch-keyboard-hint">TAP THE LETTER</p>

      {KEY_ROWS.map((row) => (
        <div className="touch-keyboard-row" key={row}>
          {row.split("").map((letter) => (
            <button
              key={letter}
              type="button"
              className="touch-key"
              disabled={pressed}
              onClick={() => onLetter(letter)}
            >
              {letter}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
