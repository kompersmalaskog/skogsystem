import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient } from "@/lib/lonesystem/server";

/**
 * GET /api/fortnox/debug-employee?id=07
 *
 * Debug-endpoint för att inspektera RÅ Fortnox-data. Hämtar:
 *   - GET /3/employees/{id}
 *   - GET /3/absencetransactions?employeeid={id}&fromdate=...&todate=...
 *   - GET /3/attendancetransactions?employeeid={id}&fromdate=...&todate=...
 *
 * Returnerar alla fält som Fortnox ger tillbaka så vi kan se vad som finns
 * för semester- och ATK-saldo. Tas bort när integrationen är klar.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "07";

    const client = await getFortnoxClient() as any;
    const accessToken: string = (client as any).accessToken;

    const idag = new Date();
    const fromDate = `${idag.getFullYear() - 1}-04-01`;
    const toDate = idag.toISOString().slice(0, 10);

    async function fn(path: string) {
      const r = await fetch(`https://api.fortnox.se/3${path}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      const text = await r.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      return { status: r.status, ok: r.ok, data };
    }

    const [employee, absence, attendance, employeeList] = await Promise.all([
      fn(`/employees/${encodeURIComponent(id)}`),
      fn(`/absencetransactions?employeeid=${encodeURIComponent(id)}&fromdate=${fromDate}&todate=${toDate}&limit=50`),
      fn(`/attendancetransactions?employeeid=${encodeURIComponent(id)}&fromdate=${fromDate}&todate=${toDate}&limit=50`),
      fn(`/employees?limit=20`),
    ]);

    const employeeFields = employee.ok && employee.data?.Employee
      ? Object.keys(employee.data.Employee).sort()
      : [];

    return NextResponse.json({
      queried_id: id,
      range: { fromDate, toDate },
      employee_fields_list: employeeFields,
      employee,
      absence,
      attendance,
      employee_list_preview: employeeList.data?.Employees?.map((e: any) => ({
        EmployeeId: e.EmployeeId,
        Name: [e.FirstName, e.LastName].filter(Boolean).join(" "),
      })) ?? employeeList.data,
    }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
