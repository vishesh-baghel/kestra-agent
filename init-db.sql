-- Enable pgvector extension for vector storage
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a sample table to verify vector functionality (optional)
-- You can remove this if not needed
CREATE TABLE IF NOT EXISTS vector_test (
    id SERIAL PRIMARY KEY,
    embedding vector(1536),  -- Common dimension for OpenAI embeddings
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create an index for vector similarity search (optional but recommended for performance)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS vector_test_embedding_idx ON vector_test 
-- USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
