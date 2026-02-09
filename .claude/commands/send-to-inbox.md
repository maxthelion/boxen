# Send to Inbox

Send a message to the human inbox for user review.

## Usage

```
/send-to-inbox <title> | <body>
```

The argument is split on the first `|` character:
- Everything before `|` is the title
- Everything after `|` is the body

If no `|` is present, the entire argument is used as both title and body.

## Instructions

1. Parse the argument to extract title and body (split on first `|`)
2. Run the backing script:

```bash
project-management/scripts/send-to-inbox.sh \
  --title "<title>" \
  --body "<body>" \
  --from "<your-agent-name-or-'interactive'>"
```

3. Confirm the message was sent by showing the created file path.

## Examples

```
/send-to-inbox Draft Filed: Widget Feature | The draft for widget feature has been filed at project-management/drafts/boxen/042-widget-feature.md and is ready for review.
```

```
/send-to-inbox QA Alert: Test Failures | 3 tests are failing in the fillet suite after the latest merge. See test output for details.
```

## Notes

- The script creates a timestamped `.md` file in `project-management/human-inbox/`
- The user reviews inbox items via `/human-inbox`
- Use `--type` to customize the filename suffix (default: "notification")
- The backend can be swapped later (file to Slack, email, etc.) without changing this interface
