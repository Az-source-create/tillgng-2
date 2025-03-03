# Astro Starter Kit: Basics

```sh
npm create astro@latest -- --template basics
```

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/withastro/astro/tree/latest/examples/basics)
[![Open with CodeSandbox](https://assets.codesandbox.io/github/button-edit-lime.svg)](https://codesandbox.io/p/sandbox/github/withastro/astro/tree/latest/examples/basics)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/withastro/astro?devcontainer_path=.devcontainer/basics/devcontainer.json)

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

![just-the-basics](https://github.com/withastro/astro/assets/2244813/a0a5533c-a856-4198-8470-2d67b1d7c554)

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

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🔑 Environment Setup

This project integrates with [NocoDB](https://nocodb.com/) to fetch and display product data. You'll need to set up environment variables to connect to your NocoDB instance.

### Setting Up Environment Variables

1. Create a `.env` file in the root of your project (or copy `.env.example` and rename it to `.env`)
2. Add the following variables to your `.env` file:

```
NOCODB_API_TOKEN=your_nocodb_api_token_here
NOCODB_API_URL=your_nocodb_api_endpoint_here
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

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
