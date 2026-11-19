import math
import unittest
from copy import deepcopy
from itertools import combinations

from pydantic import ValidationError
from backend.dataset import FEATURES
from backend.scheduler import NEW, SCENARIOS, STATION, Scenario, simulate


def sample(name):
    return deepcopy(next(s for s in SCENARIOS if s["id"] == name))


def run(s, predictor=lambda feature: 5.0):
    return simulate(Scenario.model_validate(s), "example", predictor)


class SchedulerTests(unittest.TestCase):
    def test_demo_scenarios_respect_constraints(self):
        self.assertEqual(len(SCENARIOS), 8)
        for s in SCENARIOS:
            with self.subTest(s=s["id"]):
                result = run(s, lambda x: 3.1 * x["quantity"] + x["complexity"])
                new = [t for t in result["tasks"] if t["order"] == NEW]
                self.assertEqual(result["position"], len(s["pending"]) + 1)
                self.assertEqual(result["ready"], max(t["end"] for t in new))
                self.assertEqual(result["wait"], min(t["start"] for t in new))
                self.assertAlmostEqual(result["prep"], sum(t["duration"] for t in new))
                self.assertEqual(
                    result["critical"], max(new, key=lambda t: t["end"])["id"]
                )
                self.assertEqual(len(result["trace"]), 12)
                lookup = {(t["order"], t["id"]): t for t in result["tasks"]}
                for t in result["tasks"]:
                    self.assertGreaterEqual(t["start"], 0)
                    self.assertGreaterEqual(t["start"], t["accepted"])
                    self.assertAlmostEqual(t["end"] - t["start"], t["duration"])
                    self.assertAlmostEqual(t["wait"], t["start"] - t["accepted"])
                    self.assertTrue(1 <= t["staff"] <= s["staff"])
                    self.assertTrue(1 <= t["slot"] <= s["capacities"][t["station"]])
                    for d in t["depends_on"]:
                        self.assertGreaterEqual(
                            t["start"], lookup[t["order"], d]["end"]
                        )
                    if not t["active"]:
                        self.assertEqual(t["station"], STATION[t["dish"]])
                for a, b in combinations(result["tasks"], 2):
                    if a["staff"] == b["staff"] or (a["station"], a["slot"]) == (
                        b["station"],
                        b["slot"],
                    ):
                        self.assertTrue(
                            a["end"] <= b["start"] or b["end"] <= a["start"]
                        )

    def test_parallelism_and_staff_limit(self):
        s = sample("parallel")
        self.assertEqual(run(s)["ready"], 5)
        s["staff"] = 1
        self.assertEqual(run(s)["ready"], 20)

    def test_an_older_blocked_ticket_doesnt_idle_other_resources(self):
        r = run(sample("conflict"))
        tasks = {t["id"]: t for t in r["tasks"]}
        self.assertEqual(tasks["drink"]["start"], 0)
        self.assertEqual(tasks["first"]["start"], 4.5)
        self.assertEqual(tasks["second"]["start"], 9.5)
        self.assertEqual(tasks["burger"]["start"], 14.5)
        self.assertEqual(r["ready"], 19.5)

    def test_priority_follows_acceptance_order(self):
        s = sample("conflict")
        s["pending"].reverse()
        starts = {
            t["order"]: t["start"] for t in run(s)["tasks"] if t["station"] == "Grill"
        }
        self.assertLess(starts["G-41"], starts["G-42"])

    def test_same_station_second_lane_reduces_wait(self):
        s = sample("capacity")
        one = run(s)
        s["capacities"]["Oven"] = 2
        self.assertLess(run(s)["ready"], one["ready"])

    def test_dependencies_may_reference_items_later_in_the_list(self):
        s = sample("complex")
        s["order"].reverse()
        self.assertEqual(run(s)["ready"], 15)

    def test_features_match_training_fields(self):
        seen = []

        def model(features):
            seen.append(features)
            return float(features["quantity"] * 7)

        r = run(sample("normal"), model)
        self.assertEqual(len(seen), 4)
        self.assertTrue(all(set(row) == set(FEATURES) for row in seen))
        self.assertEqual([x["pending"] for x in seen], [0, 1, 2, 2])
        self.assertEqual(r["prep"], 21)

    def test_multiple_tickets_can_use_same_task_id(self):
        s = sample("conflict")
        for p in s["pending"]:
            p["items"][0]["id"] = "burger"
        self.assertEqual(run(s)["ready"], 19.5)

    def test_detect_invalid_inputs(self):
        invalid = []
        s = sample("empty")
        s["order"][0]["depends_on"] = ["unknown"]
        invalid.append(s)
        s = sample("complex")
        s["order"][0]["depends_on"] = ["finish"]
        invalid.append(s)
        s = sample("complex")
        s["order"][0]["id"] = "main"
        invalid.append(s)
        s = sample("rush")
        s["staff"] = 1
        invalid.append(s)
        s = sample("rush")
        s["active"].append(dict(station="Grill", remaining=1))
        invalid.append(s)
        s = sample("normal")
        s["pending"][0]["id"] = NEW
        invalid.append(s)
        s = sample("normal")
        s["capacities"]["Grill"] = 0
        invalid.append(s)
        for i, s in enumerate(invalid):
            with self.subTest(i=i), self.assertRaises(ValidationError):
                run(s)

    def test_predictions_are_used_and_invalid_durations_are_explained(self):
        data = sample("empty")
        self.assertEqual(run(data, lambda _: 7.52)["ready"], 7.52)
        r = run(data, lambda _: -2.0)
        self.assertEqual(r["ready"], 0.1)
        self.assertIn("Clamped", r["trace"][3]["output"])
        with self.assertRaises(ValueError):
            run(data, lambda _: math.nan)


if __name__ == "__main__":
    unittest.main()
