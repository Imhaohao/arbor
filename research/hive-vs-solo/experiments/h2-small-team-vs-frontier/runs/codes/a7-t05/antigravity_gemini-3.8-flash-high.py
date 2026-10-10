import sys


def solve():
    input_data = sys.stdin.read().split()
    if not input_data:
        return
    a = int(input_data[0])
    c = int(input_data[1])
    m = int(input_data[2])
    x0 = int(input_data[3])
    G = int(input_data[4])

    # Precomputed card properties
    # Card k: suit floor(k / 6) (0..3), rank k % 6 (0..5)
    SUIT = [k // 6 for k in range(24)]
    RANK = [k % 6 for k in range(24)]

    # LEAD_KEY:
    # Highest rank, tie-break: smaller suit number.
    # Minimizing key: (5 - rank) * 4 + suit
    LEAD_KEY = [(5 - RANK[k]) * 4 + SUIT[k] for k in range(24)]

    # DISCARD_KEY:
    # Lowest rank, tie-break: smaller suit number.
    # Minimizing key: rank * 4 + suit
    DISCARD_KEY = [RANK[k] * 4 + SUIT[k] for k in range(24)]

    # BEATS table:
    # BEATS[trump_suit][card_c][card_b] is True iff card_c beats card_b
    BEATS = [[[False] * 24 for _ in range(24)] for _ in range(4)]
    for ts in range(4):
        for c_card in range(24):
            cs = SUIT[c_card]
            cr = RANK[c_card]
            for b_card in range(24):
                bs = SUIT[b_card]
                br = RANK[b_card]
                if cs == ts and bs != ts:
                    BEATS[ts][c_card][b_card] = True
                elif cs == bs and cr > br:
                    BEATS[ts][c_card][b_card] = True

    def choose_lead(hand, ts):
        best_non_trump = -1
        best_lead_k = 999
        lowest_trump = 999
        for card in hand:
            if SUIT[card] != ts:
                k = LEAD_KEY[card]
                if k < best_lead_k:
                    best_lead_k = k
                    best_non_trump = card
            else:
                if card < lowest_trump:
                    lowest_trump = card
        if best_non_trump != -1:
            return best_non_trump
        return lowest_trump

    def choose_follow(hand, ts, led, best, beats_ts):
        min_led_beating = 999
        min_led = 999
        min_trump_beating = 999
        best_discard_k = 999
        best_discard = -1
        min_trump = 999

        for card in hand:
            s = SUIT[card]
            if s == led:
                if card < min_led:
                    min_led = card
                if beats_ts[card][best] and card < min_led_beating:
                    min_led_beating = card
            if s == ts:
                if card < min_trump:
                    min_trump = card
                if beats_ts[card][best] and card < min_trump_beating:
                    min_trump_beating = card
            else:
                k = DISCARD_KEY[card]
                if k < best_discard_k:
                    best_discard_k = k
                    best_discard = card

        if min_led != 999:
            if min_led_beating != 999:
                return min_led_beating
            return min_led
        if min_trump_beating != 999:
            return min_trump_beating
        if best_discard != -1:
            return best_discard
        return min_trump

    state_seen = {}
    history_scores = []
    history_sweeps = []
    history_x = []

    x = x0
    g = 0

    while g < G:
        state = (x, g % 4)
        if state in state_seen:
            start_g = state_seen[state]
            period = g - start_g
            remaining = G - g
            num_cycles = remaining // period
            rem = remaining % period
            break

        state_seen[state] = g
        history_x.append(x)

        # Shuffle
        D = list(range(24))
        for i in range(23, 0, -1):
            x = (a * x + c) % m
            j = x % (i + 1)
            D[i], D[j] = D[j], D[i]

        # Deal
        hands = [
            D[0:6],
            D[6:12],
            D[12:18],
            D[18:24],
        ]
        ts = SUIT[D[23]]
        beats_ts = BEATS[ts]

        # Play 6 tricks
        leader = g % 4
        tricks_won = [0, 0, 0, 0]
        L = -1

        for _ in range(6):
            led_card = choose_lead(hands[leader], ts)
            hands[leader].remove(led_card)

            best_card = led_card
            trick_winner = leader
            led_suit = SUIT[led_card]

            for step in range(1, 4):
                seat = (leader + step) % 4
                card = choose_follow(hands[seat], ts, led_suit, best_card, beats_ts)
                hands[seat].remove(card)
                if beats_ts[card][best_card]:
                    best_card = card
                    trick_winner = seat

            tricks_won[trick_winner] += 1
            leader = trick_winner
            L = trick_winner

        # Scoring
        sweep_seat = -1
        for s in range(4):
            if tricks_won[s] == 6:
                sweep_seat = s
                break

        if sweep_seat != -1:
            game_scores = [0, 0, 0, 0]
            game_scores[sweep_seat] = 20
            is_sweep = 1
        else:
            game_scores = [0, 0, 0, 0]
            for s in range(4):
                sc = tricks_won[s]
                if s == L:
                    sc += 2
                if tricks_won[s] == 0:
                    sc -= 2
                game_scores[s] = sc
            is_sweep = 0

        history_scores.append(game_scores)
        history_sweeps.append(is_sweep)
        g += 1

    if g < G:
        tot_scores = [0, 0, 0, 0]
        for s in range(4):
            base_s = sum(history_scores[i][s] for i in range(g))
            cycle_s = sum(history_scores[i][s] for i in range(start_g, g))
            rem_s = sum(history_scores[i][s] for i in range(start_g, start_g + rem))
            tot_scores[s] = base_s + num_cycles * cycle_s + rem_s

        base_sw = sum(history_sweeps[i] for i in range(g))
        cycle_sw = sum(history_sweeps[i] for i in range(start_g, g))
        rem_sw = sum(history_sweeps[i] for i in range(start_g, start_g + rem))
        tot_sweeps = base_sw + num_cycles * cycle_sw + rem_sw

        final_x = history_x[start_g + rem]
    else:
        tot_scores = [sum(history_scores[i][s] for i in range(G)) for s in range(4)]
        tot_sweeps = sum(history_sweeps)
        final_x = x

    print(f"{tot_scores[0]} {tot_scores[1]} {tot_scores[2]} {tot_scores[3]} {tot_sweeps} {final_x}")


if __name__ == "__main__":
    solve()
