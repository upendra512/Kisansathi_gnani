# KisanSaathi: Multilingual Voice Farm Connect

## Problem
Farmers need timely advice about weather, soil, irrigation, and mandi prices, but information and supplier communication are difficult in local languages. A farmer may also need seed, transport, or equipment quickly and may not know which supplier to contact.

## Solution
KisanSaathi is a voice-first farm assistant for Hindi, Kannada, and English. The farmer asks questions by voice or text and receives a spoken answer. Farm Connect lets the farmer choose a synthetic seed store, transport provider, or equipment supplier, ask for availability, price, and delivery, review the simulated offer, and approve it before a simulated confirmation. No real call or booking is placed in this demo.

The farmer dashboard stores a profile, language preference, crop and farm details, supplier requests, reminders, and request history in browser storage. It also demonstrates retry and alternate-supplier flows for a no-answer situation.

## Gnani technology
Gnani Prisma is used for speech-to-text and Gnani Timbre for text-to-speech. The application uses Hindi, Kannada, English, and code-mixed voice interaction. Gemini is used for conversational planning where configured. Live weather and mandi feeds are used when available; clearly labelled synthetic demo data keeps the interface usable during provider outages.

## Users and impact
The primary users are small and marginal farmers who need understandable, local-language guidance and a simple way to prepare requests to farm suppliers. The design avoids real phone numbers, recorded calls, and personal identity data. It is suitable for a safe public demo and can later connect to approved telephony and supplier systems.

## Demo flow
1. Ask a crop or weather question in voice.
2. Receive a spoken multilingual answer.
3. Open Farm Connect and choose seed, transport, or equipment.
4. Review a simulated supplier offer and approve, retry, or try an alternate supplier.
5. Open the farmer profile, reminder list, and request history.
