#!/bin/sh
# Makes natural-sounding narration with Microsoft's free neural voices.
cd "$(dirname "$0")"
pip3 install -q edge-tts
VOICE="${1:-en-US-AndrewMultilingualNeural}"
python3 -m edge_tts --voice "$VOICE" --rate=+5% -f 01-intro.txt --write-media 01-intro.mp3 && echo "made 01-intro.mp3"
python3 -m edge_tts --voice "$VOICE" --rate=+5% -f 02-example.txt --write-media 02-example.mp3 && echo "made 02-example.mp3"
python3 -m edge_tts --voice "$VOICE" --rate=+5% -f 03-start-here.txt --write-media 03-start-here.mp3 && echo "made 03-start-here.mp3"
python3 -m edge_tts --voice "$VOICE" --rate=+5% -f 04-account.txt --write-media 04-account.mp3 && echo "made 04-account.mp3"
python3 -m edge_tts --voice "$VOICE" --rate=+5% -f 05-chat.txt --write-media 05-chat.mp3 && echo "made 05-chat.mp3"
python3 -m edge_tts --voice "$VOICE" --rate=+5% -f 06-promise-radar.txt --write-media 06-promise-radar.mp3 && echo "made 06-promise-radar.mp3"
python3 -m edge_tts --voice "$VOICE" --rate=+5% -f 07-phone-call.txt --write-media 07-phone-call.mp3 && echo "made 07-phone-call.mp3"
python3 -m edge_tts --voice "$VOICE" --rate=+5% -f 08-product-insights.txt --write-media 08-product-insights.mp3 && echo "made 08-product-insights.mp3"
python3 -m edge_tts --voice "$VOICE" --rate=+5% -f 09-close.txt --write-media 09-close.mp3 && echo "made 09-close.mp3"
python3 -m edge_tts --voice "$VOICE" --rate=+5% -f script.txt --write-media full-narration.mp3 && echo "made full-narration.mp3"
open .
