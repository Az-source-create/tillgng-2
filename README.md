# Tillgång is a web app equimpent library management

## This project was built using Astro Build and Starter Kit: Basics

using the command

```sh
npm create astro@latest -- --template basics
```

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── ProductGrid.astro
│   │   └── Welcome.astro
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   └── index.astro
│   └── utils/
│       └── api.js
├── .env
├── .env.example
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [a guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🔑 Environment Setup

This project integrates with [NocoDB](https://nocodb.com/) to fetch and display product data and store the bookings. You'll need to set up environment variables to connect to your NocoDB instance.

### Setting Up Environment Variables

1. Create a `.env` file in the root of your project (or copy `.env.example` and rename it to `.env`)
2. Add the following variables to your `.env` file:

```
# NocoDB API Configuration
# The API token for authenticating with NocoDB
NOCODB_API_TOKEN=your_nocodb_api_token_here
# The NocoDB API endpoint URL for retrieving records
# Example: https://app.nocodb.com/api/v2/tables/{table_id}/records
PRODUCTS_TABLE_URL=your_nocodb_api_endpoint_here
BOOKING_TABLE_URL=your_nocodb_bookings_table
```

### Getting NocoDB Values

1. **API Token**: Log into your NocoDB dashboard, go to Settings > API tokens, and create or copy an existing token
2. **API URL**: This is the endpoint for your table data, formatted as: `https://app.nocodb.com/api/v2/tables/{table_id}/records`

### Important Notes

- Never commit your `.env` file to version control (it's already in `.gitignore`)
- The `.env.example` file is provided as a template and can be safely committed
- For local development, make sure to restart your development server after changing environment variables

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Sending confirmation emails.

For sending confirmation emails we are looking into using Resend.com

## To deploy to production you can use:

Railway.com or similar

