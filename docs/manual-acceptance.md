# Manual Discord Acceptance Checklist

Use this checklist in the configured test guild after all automated checks and
the live Lavalink integration suite pass. A human must confirm voice-channel
audio; starting the bot successfully is not evidence that audio played.

## Sign-off

| Field | Value |
| --- | --- |
| Commit SHA | |
| Date and timezone | |
| Operator | |
| Test guild | |
| Lavalink version | |
| YouTube plugin version | |
| Overall result (`PASS` or `FAIL`) | |

Record `PASS` or `FAIL` and concise evidence for every scenario. Do not place
tokens, passwords, or complete environment files in the evidence column.

## Scenarios

| # | Scenario and actions | Expected result | Result | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Run `npm run deploy` and inspect the test guild. | `/play`, `/skip`, `/pause`, `/resume`, `/queue`, and `/disconnect` are registered. | | |
| 2 | Join a voice channel and run `/play` with a public video URL. | The bot joins the requester's channel, replies with the playing track, and audible playback begins. | | |
| 3 | While the first track plays, queue another video and then a playlist. Wait for advancement. | `/queue` preserves request order; each track starts exactly once and playback advances automatically. | | |
| 4 | Pause, resume, skip, inspect `/queue`, and disconnect. | Pause stops audible playback, resume continues it, skip advances once, queue output matches state, and disconnect clears the queue and leaves voice. | | |
| 5 | Invoke controls while outside voice, then from a different voice channel. | The bot returns the specified same-channel errors and playback state does not change. | | |
| 6 | Try plain text or a malformed link, an unavailable video, a playlist with no playable entries, and `/queue` with no tracks. | Each case returns its defined user-facing error without an uncaught exception. | | |
| 7 | Remove the bot's View Channel, Connect, or Speak permission and invoke `/play`. Restore permissions afterward. | The permission error is returned and no player or queue remains. | | |
| 8 | Stop Lavalink and invoke a music command, then restart Lavalink. | The command returns the audio-service-unavailable response within the bounded timeout; the bot remains online and utility commands still work. | | |
| 9 | Force-disconnect or move the bot while music is active. | Guild music state is cleared and the next `/play` creates a fresh player. | | |
| 10 | Leave the bot alone in voice, rejoin before the grace period expires, then leave again. | Rejoining cancels cleanup; the second departure disconnects the bot after the grace period with no stale timer or player. | | |
| 11 | Queue multiple tracks, restart the bot, and inspect `/queue`. | Shutdown is graceful and the old in-memory queue is gone after restart. | | |

## Failure record

For each failed scenario, record the command, timestamp, relevant sanitized
bot and Lavalink event names, and an issue link. The release is blocked until
every row passes against the commit listed in the sign-off table.
