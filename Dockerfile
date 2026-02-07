FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose the application port
EXPOSE 3000

# Create upload directory in container if it doesn't exist (handled by mkdir in code, but good practice)
RUN mkdir -p public/uploads

# Start the application
CMD ["npm", "start"]
