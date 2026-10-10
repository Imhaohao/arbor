import sys


def main():
    data = list(map(int, sys.stdin.buffer.read().split()))
    n, V, q = data[0], data[1], data[2]
    requirements = [0] + data[3:3 + V]
    start = 3 + V
    deliveries = data[start:start + n]

    positions = [[] for _ in range(V + 1)]
    for day, product in enumerate(deliveries, 1):
        positions[product].append(day)

    # The first globally insufficient type bounds every answer.
    limit = V + 1
    for product in range(1, V + 1):
        if len(positions[product]) < requirements[product]:
            limit = product
            break

    if limit == 1:
        sys.stdout.write("1\n" * q)
        return

    positions = positions[:limit]
    cursor = [-requirements[v] for v in range(limit)]
    del requirements

    # Bucket queries by their right endpoint.
    head = [-1] * (n + 1)
    next_query = [-1] * q
    left_endpoint = [0] * q
    offset = start + n

    for query_id in range(q):
        left = data[offset]
        right = data[offset + 1]
        offset += 2
        left_endpoint[query_id] = left
        next_query[query_id] = head[right]
        head[right] = query_id

    del data

    size = 1 << (limit - 1).bit_length()
    tree = [0] * (size << 1)
    answers = [""] * q

    # Leaf v stores the position of its c_v-th most recent occurrence,
    # or zero if too few occurrences have arrived.
    # Type 'limit' is an always-insufficient sentinel.
    for day, product in enumerate(deliveries, 1):
        if product < limit:
            index = cursor[product] + 1
            cursor[product] = index

            if index >= 0:
                node = size + product - 1
                tree[node] = positions[product][index]
                node >>= 1

                while node:
                    child = node << 1
                    value = tree[child]
                    other = tree[child + 1]
                    if other < value:
                        value = other

                    if tree[node] == value:
                        break
                    tree[node] = value
                    node >>= 1

        query_id = head[day]
        while query_id != -1:
            left = left_endpoint[query_id]
            node = 1

            # A type is insufficient exactly when its leaf value < left.
            while node < size:
                node <<= 1
                if tree[node] >= left:
                    node += 1

            answers[query_id] = str(node - size + 1)
            query_id = next_query[query_id]

    sys.stdout.write("\n".join(answers))


if __name__ == "__main__":
    main()
