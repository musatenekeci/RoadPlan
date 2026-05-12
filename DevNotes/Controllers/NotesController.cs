using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using DevNotes.Data;
using DevNotes.Models;

namespace DevNotes.Controllers;

public class NotesController : Controller
{
    private readonly AppDbContext _db;

    public NotesController(AppDbContext db) => _db = db;

    public async Task<IActionResult> Index(int? id)
    {
        var notes = await _db.Notes
            .OrderByDescending(n => n.IsPinned)
            .ThenByDescending(n => n.UpdatedAt)
            .ToListAsync();

        Note? selected = id.HasValue
            ? notes.FirstOrDefault(n => n.Id == id) ?? notes.FirstOrDefault()
            : notes.FirstOrDefault();

        ViewBag.Notes = notes;
        ViewBag.SelectedId = selected?.Id;
        return View(selected);
    }

    [HttpGet]
    public async Task<IActionResult> Get(int id)
    {
        var note = await _db.Notes.FindAsync(id);
        if (note == null) return NotFound();
        return Json(note);
    }

    [HttpPost]
    [IgnoreAntiforgeryToken]
    public async Task<IActionResult> Save([FromBody] NoteInput input)
    {
        Note note;
        if (input.Id == 0)
        {
            note = new Note
            {
                Title = input.Title.Trim().Length > 0 ? input.Title.Trim() : "Untitled",
                Content = input.Content,
                Language = input.Language,
                Tags = input.Tags.Trim(),
                IsPinned = input.IsPinned,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _db.Notes.Add(note);
        }
        else
        {
            note = await _db.Notes.FindAsync(input.Id);
            if (note == null) return Json(new { success = false, error = "Not found" });

            note.Title = input.Title.Trim().Length > 0 ? input.Title.Trim() : "Untitled";
            note.Content = input.Content;
            note.Language = input.Language;
            note.Tags = input.Tags.Trim();
            note.IsPinned = input.IsPinned;
            note.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return Json(new { success = true, id = note.Id });
    }

    [HttpPost]
    [IgnoreAntiforgeryToken]
    public async Task<IActionResult> Delete([FromBody] IdRequest req)
    {
        var note = await _db.Notes.FindAsync(req.Id);
        if (note != null)
        {
            _db.Notes.Remove(note);
            await _db.SaveChangesAsync();
        }
        return Json(new { success = true });
    }

    [HttpPost]
    [IgnoreAntiforgeryToken]
    public async Task<IActionResult> TogglePin([FromBody] IdRequest req)
    {
        var note = await _db.Notes.FindAsync(req.Id);
        if (note == null) return NotFound();
        note.IsPinned = !note.IsPinned;
        await _db.SaveChangesAsync();
        return Json(new { success = true, isPinned = note.IsPinned });
    }

    public record NoteInput(int Id, string Title, string Content, string Language, string Tags, bool IsPinned);
    public record IdRequest(int Id);
}
