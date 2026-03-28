#!/bin/bash
# 在容器内运行对齐接口单元测试

echo "🧪 Running comparison alignments tests in container..."

# Copy test file to container
docker cp tests/routes/comparisons.test.ts doc-compare-api-1:/app/tests/routes/

# Run tests in container with database access
docker exec doc-compare-api-1 npm test -- tests/routes/comparisons.test.ts 2>&1

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Tests failed with exit code $TEST_EXIT_CODE"
fi

exit $TEST_EXIT_CODE
