# Start here

Setup takes about 20 minutes. You do it once.

## 1. Make your sheets (10 minutes)

1. Download the three files in [`sheets/`](sheets): `opportunities.csv`, `deadlines.csv` and `contacts.csv`. On GitHub, open each file and click the download icon ("Download raw file") at the top right of the file. Or, on the main page of this repository, click **Code > Download ZIP** to get everything at once.
2. Create a new Google Sheet. Name it something like "Admin records".
3. Import each file as its own tab: **File > Import > Upload**, choose the file, choose **Insert new sheet(s)**, then click **Import data**.
4. Rename the tabs **Opportunities**, **Deadlines** and **Contacts**.

Each file holds only the column headings. What the columns mean is in [sheets/columns.md](sheets/columns.md).

Excel works too. Open the first file and save it as an Excel workbook. Open the other two, then right-click each tab, choose **Move or Copy** and move it into the first workbook.

## 2. Give your assistant its rules (5 minutes)

Open [assistant-instructions.md](assistant-instructions.md). Copy everything below the line, and fill in the three lines under "About me" (your art form, where you live, your time zone) before you paste.

- **Claude**: create a Project and paste the text into the project instructions.
- **ChatGPT**: create a Project (or a custom GPT) and paste the text into its instructions.

Projects and custom GPTs are not on every plan.

If your assistant has no place for standing instructions, paste the text at the start of each new chat.

## 3. Try one routine (5 minutes)

Open [routines/weekly-check.md](routines/weekly-check.md), copy the text below the line into a chat in your Project, and paste your Deadlines, Opportunities and Contacts rows under it. Your sheets will be empty at first, so the answer will be short. That is fine.

## How to use it from then on

| When | Routine |
|---|---|
| Once a week (Monday works well) | [Weekly check](routines/weekly-check.md) |
| When emails pile up | [Sort my emails](routines/sort-emails.md) |
| When you find an open call | [Check an open call](routines/check-open-call.md) |
| When you need to answer someone | [Draft a reply](routines/draft-reply.md) |
| After you apply, or hear back | [Record what happened](routines/record-outcome.md) |

Each routine ends with rows for you to paste into your sheets. Pasting them is how the assistant's work is remembered. The chat itself is not a reliable memory.

## Connecting your accounts (optional)

On some plans, Claude and ChatGPT can connect to Gmail and Google Drive, so you do not need to copy and paste. If you connect them:

- the instructions tell the assistant to read and draft only, but they are not a lock. Give it the least access you can, and never approve an action you did not ask for.
- check what access you are giving, and turn off what you do not need

Copy and paste works just as well, and keeps you in control of what the assistant sees.

## Privacy

- Never paste passwords, verification codes or bank and card numbers into a chat. Blank them out first.
- Other people's details (emails, phone numbers) are theirs. Paste only what the task needs.
- Keep your sheet private. The Contacts tab holds other people's details, so do not share it by link.
- Check your assistant's settings for whether your chats are used to train its models, and choose what you are comfortable with.
