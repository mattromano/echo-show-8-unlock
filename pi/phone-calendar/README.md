# Phone calendar relay (iPhone → bedroom Pi → Echo)

The iPhone already has every calendar with full details, including the work Exchange account, which only
publishes free/busy. An **iOS Shortcut** sends the next few days of events to this small service on the
bedroom Pi (`8gigapi`, **192.168.4.98:8767**). Kitchen Home reads them back as an ordinary iCal feed.

- `POST /events` needs `Authorization: Bearer <token>`. The token is in `/etc/phone-calendar.conf` on the Pi
  (copy on the PC: `C:\Users\mattr\phone-calendar-token.txt`, not in the repo).
  Each upload **replaces** the previous one. Only the latest list is kept, in `~/phone-calendar/events.json`.
- `GET /calendar.ics` returns all calendars. `GET /calendar.ics?cal=Work` returns one calendar; comma-separate for several.
- `GET /status` shows when the phone last uploaded and how many events per calendar (no titles).
- Install or update: `scp -r pi/phone-calendar matt@192.168.4.98:~/`, then `ssh matt@192.168.4.98 'bash ~/phone-calendar/install.sh'`.

The event list is readable by anything on the home LAN, like the other Pi services. Work meeting titles leave
the work account here, so check that's OK with your employer's policy.

## Building the Shortcut (iPhone, about 5 minutes)

Shortcuts app → **+** (new shortcut), name it **Send calendar to Echo**, then add these actions in order:

1. **Find Calendar Events**, then set:
   - **Filter:** *Start Date* **is in the next** *5 days*.
   - Tap **Add Filter**, then *Calendar* **is** (pick the calendars you want, e.g. Work, Bear Fam). For several, change "All of the following" to "Any of the following" only if every filter is a calendar filter; otherwise leave it out and filter on the Echo with `?cal=`.
   - **Sort by** *Start Date*, *Oldest First*. Turn **Limit** off.
2. **Repeat with Each** (item = *Calendar Events*). Inside the repeat, add **Text** with exactly this template (tap each word in
   *italics* and insert it from the **Repeat Item** variable's properties):

   *Start Date*`|`*End Date*`|`*Is All Day*`|`*Calendar*`|`*Location*`|`*Title*

   For **Start Date** and **End Date**: tap the inserted variable → **Date Format: ISO 8601**, and turn **Include ISO 8601 Time** on.
3. After **End Repeat**: **Combine Text** (*Repeat Results*, separator **New Lines**).
4. **Get Contents of URL**:
   - URL: `http://192.168.4.98:8767/events`
   - Method **POST**. Headers: **Authorization** = `Bearer ` followed by the token from the token file (one space after "Bearer").
   - Request Body: **File**, then choose *Combined Text*.
5. Run it once with ▶. The result should read `{"ok": true, "stored": N, ...}`. Allow it to access your calendars when asked.

**Keep it running automatically** (Shortcuts → **Automation** → **+** → **Time of Day**):
- Make a few, e.g. 6:00, 9:00, 12:00, 15:00, 18:00 daily, each running *Send calendar to Echo*.
- Choose **Run Immediately** (and turn off "Notify When Run") so it doesn't ask each time.
- Optional: an **App → Calendar → Is Closed** automation, so edits you make on the phone go out right away.

**Check it:** `http://192.168.4.98:8767/status` in a browser shows the last upload time and counts per calendar.

## On the Echo

In ⚙ Settings → Calendars, add `http://192.168.4.98:8767/calendar.ics?cal=<Calendar name>` once per calendar
(so each gets its own colour), or one feed without `?cal=` for everything.
Then remove the busy-only Outlook feed (it would show every work meeting twice) and the Google Bear Fam feed
if the phone covers it (identical title and start time are de-duplicated anyway).
