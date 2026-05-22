# Leafly Apothecary Integration Design

## Overview
This feature integrates Verdant Apothecary with the Official Leafly B2B API to pull strain data dynamically, transforming recreational data into clinical `ChemovarRecord` entities using an AI-assisted tagging system powered by a DeepSeek model via OpenRouter.

## Architecture & Data Flow
- **Ingestion Pipeline**: Connects to the Official Leafly B2B API.
- **Storage**: Data is fetched, transformed, and saved into the PostgreSQL database as `ChemovarRecord` entities for zero-latency local queries and full control over the data.

## Trigger Mechanisms
- **Automated Sync**: A background job (Next.js Cron or Supabase pg_cron) will run nightly to fetch new strains and update existing ones.
- **Manual Override**: An Admin UI action will be provided to allow clinical staff to trigger an immediate sync of the catalog at any time.

## AI-Assisted Clinical Translation
- **Ontology Mapping**: The ingestion pipeline passes Leafly's raw payload (name, recreational effects, text description) to OpenRouter.
- **AI Model**: A frontier DeepSeek model interprets the text and outputs a structured list of strict clinical `therapeuticTags` (e.g., "Insomnia", "Anxiolytic") along with the expected `chemotype`.
- **Persistence**: This parsed, clinically-relevant data is saved to the `ChemovarRecord`.

## Components
1. **Database Schema**: Ensure `ChemovarRecord` model exists in `schema.prisma`.
2. **Leafly API Client**: A dedicated client to fetch the raw data.
3. **OpenRouter AI Client**: A utility to interact with DeepSeek for ontology mapping.
4. **Sync Service**: The core logic coordinating the fetch, AI mapping, and DB upsert.
5. **Cron Job**: The automated trigger for the sync service.
6. **Admin UI**: The manual trigger interface.

## Testing Strategy
- Unit tests for the AI mapping prompt and parsing logic.
- Mock the Leafly API and OpenRouter API to test the Sync Service in isolation.
- Integration tests for the Admin UI trigger.
