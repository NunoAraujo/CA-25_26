FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma

# Build TypeScript (optional for dev, required for prod)
# RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "dev"]
