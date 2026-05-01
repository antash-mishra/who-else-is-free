# Firebase Analytics Quick Guide

Use this when you want to find a specific kind of analysis.

## App Usage

Go to `Firebase Console > Analytics Dashboard`.

Use this for:
- app opens
- active users
- retention
- general usage trends

## Last 30 Minutes

From `Firebase Console > Analytics Dashboard`, click `View more in Google Analytics`, then go to `Reports > Realtime`.

Use this for:
- users active right now
- events happening recently
- quick checks after a release

## Screen Usage

From `Firebase Console > Analytics Dashboard`, click `View more in Google Analytics`, then go to `Reports > Engagement > Pages and screens`.

Use this for:
- which pages people visit
- which screen gets the most traffic
- screen names sent by the app

## Custom Events

From `Firebase Console > Analytics Dashboard`, click `View more in Google Analytics`, then go to `Reports > Engagement > Events`.

Use this for events like:
- `signup_succeeded`
- `event_create_succeeded`
- `join_request_succeeded`
- `message_sent`

## Live Testing

From `Firebase Console > Analytics Dashboard`, click `View more in Google Analytics`, then go to `Admin > Data display > DebugView`.

Use this when you want to check whether an event fired right now on your device.

## Funnels

From `Firebase Console > Analytics Dashboard`, click `View more in Google Analytics`, then go to `Explore`.

Use this for step-by-step paths like:
- open app -> sign in -> create event
- open app -> event details -> join request

## Audiences

From `Firebase Console > Analytics Dashboard`, click `View more in Google Analytics`, then go to `Admin > Data display > Audiences`.

Use this for groups like:
- users who never signed in
- users who signed up but never created an event
- hosts with no joins

## Backend Analytics

Open this API URL:

```text
/api/admin/analytics/summary
```

Use this for:
- event counts
- join request totals
- message totals
- events with no approved joins

## Rule Of Thumb

- Use `Firebase Analytics` for app behavior.
- Use `Google Analytics > Explore` for funnels.
- Use `Google Analytics > Admin > Data display > Audiences` for user groups.
- Use the backend API for saved database totals.
