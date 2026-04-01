"use client";

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { UploadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ColumnMapping = {
  questionColumn: string;
};

type BulkUploadConfig = {
  fileName: string;
  rowCount: number;
  headers: string[];
  selectedColumn: string;
  questions: string[];
  mapping: ColumnMapping;
};

const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

function findHeaderByKeywords(headers: string[], keywords: string[]) {
  const normalized = headers.map((header) => ({
    original: header,
    normalized: header.toLowerCase(),
  }));

  for (const keyword of keywords) {
    const match = normalized.find((header) =>
      header.normalized.includes(keyword)
    );
    if (match) {
      return match.original;
    }
  }

  return "";
}

function suggestInitialMapping(headers: string[]): ColumnMapping {
  return {
    questionColumn: findHeaderByKeywords(headers, [
      "question",
      "query",
      "prompt",
      "ask",
      "issue",
    ]),
  };
}

export function BulkUploadSelector({
  onConfigured,
}: {
  onConfigured?: (config: BulkUploadConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>({ questionColumn: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canRun = headers.length > 0 && Boolean(mapping.questionColumn);

  const resetState = () => {
    setFileName("");
    setHeaders([]);
    setPreviewRows([]);
    setCsvRows([]);
    setRowCount(0);
    setIsParsing(false);
    setMapping({ questionColumn: "" });
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  };

  const handleFileSelection = async (file: File) => {
    setIsParsing(true);

    try {
      const fileExtension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isExcelFile = fileExtension === "xlsx" || EXCEL_MIME_TYPES.has(file.type);

      let detectedHeaders: string[] = [];
      let normalizedRows: Record<string, string>[] = [];

      if (isExcelFile) {
        const fileBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(fileBuffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) {
          toast.error("No sheets found in this Excel file");
          return;
        }

        const firstSheet = workbook.Sheets[firstSheetName];
        const sheetMatrix = XLSX.utils.sheet_to_json(firstSheet, {
          header: 1,
          blankrows: false,
          raw: false,
        }) as Array<Array<string | number | boolean | null | undefined>>;

        if (sheetMatrix.length === 0) {
          toast.error("No columns found in this Excel file");
          return;
        }

        detectedHeaders = (sheetMatrix[0] ?? [])
          .map((cell: string | number | boolean | null | undefined) => String(cell ?? "").trim())
          .filter((header: string) => header.length > 0);

        if (detectedHeaders.length === 0) {
          toast.error("No columns found in this Excel file");
          return;
        }

        normalizedRows = sheetMatrix
          .slice(1)
          .map((row: Array<string | number | boolean | null | undefined>) => {
            const result: Record<string, string> = {};
            for (const [index, header] of detectedHeaders.entries()) {
              result[header] = String(row[index] ?? "").trim();
            }
            return result;
          })
          .filter((row: Record<string, string>) => detectedHeaders.some((header) => row[header]));
      } else {
        const csvText = await file.text();
        const parsed = Papa.parse<Record<string, string>>(csvText, {
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (header) => header.trim(),
        });

        if (parsed.errors.length > 0) {
          const firstError = parsed.errors[0]?.message || "Unable to parse CSV file";
          toast.error(firstError);
          return;
        }

        detectedHeaders = (parsed.meta.fields ?? [])
          .map((header) => header.trim())
          .filter(Boolean);

        if (detectedHeaders.length === 0) {
          toast.error("No columns found in this CSV file");
          return;
        }

        normalizedRows = parsed.data
          .map((row) => {
            const result: Record<string, string> = {};
            for (const header of detectedHeaders) {
              result[header] = String(row[header] ?? "").trim();
            }
            return result;
          })
          .filter((row) => detectedHeaders.some((header) => row[header]));
      }

      setFileName(file.name);
      setHeaders(detectedHeaders);
      setCsvRows(normalizedRows);
      setPreviewRows(normalizedRows.slice(0, 5));
      setRowCount(normalizedRows.length);
      setMapping(suggestInitialMapping(detectedHeaders));
    } catch (_error) {
      toast.error("Failed to read the selected file. Please use a valid CSV or XLSX file.");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const runBulkUpload = () => {
    if (!mapping.questionColumn) {
      toast.error("Select a question column to continue");
      return;
    }

    const questions = csvRows
      .map((row) => String(row[mapping.questionColumn] ?? "").trim())
      .filter((value) => value.length > 0);

    if (questions.length === 0) {
      toast.error("No questions found in the selected column");
      return;
    }

    onConfigured?.({
      fileName,
      rowCount,
      headers,
      selectedColumn: mapping.questionColumn,
      questions,
      mapping,
    });

    toast.success(`Started batch run for ${questions.length} questions`);
    setOpen(false);
  };

  return (
    <Dialog onOpenChange={handleDialogOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button
          className="h-8 max-w-[12rem] justify-start gap-2 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground data-[state=open]:bg-accent/70 data-[state=open]:text-foreground"
          variant="ghost"
        >
          <UploadIcon size={14} />
          <span className="truncate">Bulk Upload</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>Bulk Question Upload</DialogTitle>
          <DialogDescription>
            Upload a CSV or XLSX, select one column to run, and start batch execution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <input
            accept=".csv,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleFileSelection(file);
              }
            }}
            ref={fileInputRef}
            type="file"
          />

          {headers.length === 0 ? (
            <div className="space-y-4">
              <button
                className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:bg-muted/50"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <UploadIcon size={20} />
                <div>
                  <p className="font-medium">Choose CSV or XLSX file</p>
                  <p className="text-sm text-muted-foreground">
                    Click to browse. First row should contain column names.
                  </p>
                </div>
              </button>

              {isParsing && (
                <p className="text-sm text-muted-foreground">Reading and validating file...</p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p className="font-medium">{fileName}</p>
                <p className="text-muted-foreground">
                  {rowCount} rows • {headers.length} columns
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Select column to run <span className="text-destructive">*</span>
                </p>
                <Select
                  onValueChange={(value) => setMapping({ questionColumn: value })}
                  value={mapping.questionColumn || ""}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select one column" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((header) => (
                      <SelectItem key={header} value={header}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!mapping.questionColumn && (
                  <p className="text-xs text-destructive">Select one column before starting</p>
                )}
                {mapping.questionColumn && (
                  <p className="text-xs text-muted-foreground">
                    Total Questions Found: {
                      csvRows
                        .map((row) => String(row[mapping.questionColumn] ?? "").trim())
                        .filter((value) => value.length > 0).length
                    }
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end">
                <Button onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
                  Choose Another File
                </Button>
              </div>

              {previewRows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Preview (first 5 rows)</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          {headers.map((header) => (
                            <th className="border-b px-3 py-2 font-medium" key={header}>
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, rowIndex) => (
                          <tr
                            className="odd:bg-background even:bg-muted/20"
                            key={`preview-row-${rowIndex}`}
                          >
                            {headers.map((header) => (
                              <td className="max-w-[220px] truncate px-3 py-2" key={`${rowIndex}-${header}`}>
                                {row[header] || "-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <div className="flex w-full items-center justify-between gap-2">
            <Button onClick={() => handleDialogOpenChange(false)} variant="outline">
              Cancel
            </Button>

            <Button disabled={!canRun} onClick={runBulkUpload}>
              Start Batch Run
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
